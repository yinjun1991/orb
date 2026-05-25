import { findProjectRoot, parseOrbConfig } from '../core/config.js';
import { runAgent, AgentType } from '../core/adapter.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

interface BugEntry {
  number: number;
  title: string;
  status: string;
  round: number;
  blockReason?: string;
}

export async function reviewCommand(issueId: string): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Error: Not in an orb project.'));
    process.exit(1);
  }

  const configPath = path.join(projectRoot, '.orb.yaml');
  if (!fs.existsSync(configPath)) {
    console.error(chalk.red('Error: .orb.yaml not found.'));
    process.exit(1);
  }
  const config = parseOrbConfig(fs.readFileSync(configPath, 'utf-8'));

  const issueDir = path.join(projectRoot, 'issues', issueId);
  if (!fs.existsSync(issueDir)) {
    console.error(chalk.red(`Error: Issue ${issueId} not found.`));
    process.exit(1);
  }

  const repoName = path.basename(config.repos[0].path);
  const worktreePath = path.join(projectRoot, 'worktrees', issueId, repoName);
  const agent: AgentType = config.review_agent ?? config.agent;
  const maxRounds = config.max_review_rounds ?? 3;

  updateIssueStatus(projectRoot, issueId, 'reviewing');

  console.log(chalk.bold(`Reviewing ${issueId}`));
  console.log();
  console.log(`  ${chalk.gray('Agent:')}    ${agent}`);
  console.log(`  ${chalk.gray('Max rounds:')} ${maxRounds}`);
  console.log();

  let round = 0;

  while (round < maxRounds) {
    round++;

    // ── REVIEW phase ──
    console.log(chalk.bold(`Round ${round}/${maxRounds} — Review`));
    const reviewSpinner = ora('Running code-reviewer agent...').start();

    try {
      await runAgent(agent, {
        skill: 'orb-code-reviewer',
        workdir: worktreePath,
        prompt: buildReviewPrompt(issueId),
        contextFiles: [
          `issues/${issueId}/tech_design.md`,
          `issues/${issueId}/code_plan.md`,
          `issues/${issueId}/base_version.json`,
          `issues/${issueId}/bugs.md`,
        ],
      });
    } catch (err: any) {
      reviewSpinner.fail(`Review failed: ${err.message}`);
      process.exit(1);
    }

    // Scan bugs after review
    const bugsAfterReview = scanBugs(issueDir, round);

    const unresolved = bugsAfterReview.filter(b => b.status === 'unresolved');
    const blocked = bugsAfterReview.filter(b => b.status === 'blocked');
    const pending = bugsAfterReview.filter(b => b.status === 'pending_verification');
    const resolved = bugsAfterReview.filter(b => b.status === 'resolved');
    const active = [...unresolved, ...pending, ...blocked];

    if (active.length === 0) {
      reviewSpinner.succeed('Review passed — no bugs found');
      console.log();
      console.log(`  ${chalk.green(`✔`)} ${resolved.length} resolved, 0 remaining`);
      console.log();
      console.log(`  Next: ${chalk.cyan(`orbc done ${issueId}`)}`);
      return;
    }

    reviewSpinner.succeed(
      `${bugsAfterReview.length} bug(s): ${chalk.red(unresolved.length)} unresolved, ${chalk.yellow(pending.length)} pending, ${chalk.green(resolved.length)} resolved, ${chalk.gray(blocked.length)} blocked`,
    );

    // If only blocked + resolved → human needed
    if (unresolved.length === 0 && pending.length === 0 && blocked.length > 0) {
      console.log();
      console.log(chalk.yellow(`All remaining bugs are blocked — human intervention needed.`));
      for (const b of blocked) {
        const reason = b.blockReason ? ` — ${b.blockReason}` : '';
        console.log(`  ${chalk.gray('⊘')} #${b.number} ${b.title} (blocked${reason})`);
      }
      console.log();
      return;
    }

    // If no unresolved → review passed
    if (unresolved.length === 0) {
      console.log();
      console.log(`  All bugs resolved or pending verification.`);
      continue; // back to review for verification
    }

    // ── FIX phase ──
    console.log();
    console.log(chalk.bold(`Round ${round}/${maxRounds} — Fix`));
    const fixSpinner = ora(`Fixing ${unresolved.length} unresolved bug(s)...`).start();

    const bugFiles = unresolved.map(b => `issues/${issueId}/bugs/bug${b.number}.md`);

    try {
      await runAgent(agent, {
        skill: 'orb-developer',
        workdir: worktreePath,
        prompt: buildFixPrompt(issueId, unresolved),
        contextFiles: [
          `issues/${issueId}/tech_design.md`,
          `issues/${issueId}/bugs.md`,
          ...bugFiles,
        ],
      });
    } catch (err: any) {
      fixSpinner.fail(`Fix failed: ${err.message}`);
      process.exit(1);
    }

    // Scan bugs after fix
    const bugsAfterFix = scanBugs(issueDir, round);
    const stillUnresolved = bugsAfterFix.filter(b => b.status === 'unresolved');

    if (stillUnresolved.length === 0) {
      fixSpinner.succeed('All bugs addressed');
    } else {
      fixSpinner.warn(`${stillUnresolved.length} bug(s) still unresolved`);
    }
    console.log();
  }

  // Max rounds reached
  const finalBugs = scanBugs(issueDir, round);
  const remaining = finalBugs.filter(b => b.status !== 'resolved');
  console.log(chalk.yellow(`Max rounds (${maxRounds}) reached. ${remaining.length} bug(s) remain.`));
  console.log();
  console.log(`  Review the remaining bugs and run ${chalk.cyan(`orbc review ${issueId}`)} again.`);
}

/**
 * Scan bugs by reading the bugs.md index table.
 * Status is only stored in bugs.md — bug<n>.md files are description-only.
 */
function scanBugs(issueDir: string, round: number): BugEntry[] {
  const indexPath = path.join(issueDir, 'bugs.md');
  if (!fs.existsSync(indexPath)) return [];

  const content = fs.readFileSync(indexPath, 'utf-8');
  const bugs: BugEntry[] = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|\s*(.*?)\s*\|/);
    if (match) {
      bugs.push({
        number: parseInt(match[1], 10),
        title: match[2].trim(),
        status: match[3],
        blockReason: match[4].trim() || undefined,
        round,
      });
    }
  }
  return bugs;
}

function buildReviewPrompt(issueId: string): string {
  return [
    `Review issue ${issueId}.`,
    '',
    'Before reviewing:',
    `1. Read issues/${issueId}/base_version.json to find the base commit`,
    `2. Run git diff <base_commit> to see all changes`,
    `3. Read issues/${issueId}/tech_design.md to understand the design`,
    `4. Read issues/${issueId}/bugs.md for existing bug history`,
    '',
    'For each pending_verification bug: verify the fix.',
    '  - If fixed correctly → update bugs.md: change status to resolved',
    '  - If still broken → update bugs.md: change status back to unresolved (explain why in a comment)',
    '',
    'For new issues found: create a new bug<n>.md in issues/' + issueId + '/bugs/',
    '(description only, no Status field). Add the entry to bugs.md with status=unresolved.',
    'Use the next available bug number.',
    '',
    'After all checks, ensure issues/' + issueId + '/bugs.md is up to date.',
    '',
    'If no new bugs and all pending_verification bugs are now resolved:',
    'output NO_BUGS_FOUND',
  ].join('\n');
}

function buildFixPrompt(issueId: string, bugs: BugEntry[]): string {
  const bugList = bugs.map(b => `  - bug${b.number}.md: ${b.title}`).join('\n');

  return [
    `Fix unresolved bugs for issue ${issueId}.`,
    '',
    'Bugs to fix:',
    bugList,
    '',
    'For each bug:',
    `1. Read issues/${issueId}/bugs/bug<n>.md for details`,
    `2. Fix the code in the worktree`,
    `3. Update the bug status in issues/${issueId}/bugs.md to pending_verification`,
    '',
    'If a bug cannot be fixed (needs design change):',
    '  - Update the bug status in bugs.md to blocked',
    '  - Fill the Block reason column explaining why',
    '',
    'After all fixes, ensure issues/' + issueId + '/bugs.md is up to date.',
    'Run tests to check for regressions.',
  ].join('\n');
}

function updateIssueStatus(projectRoot: string, issueId: string, newStatus: string): void {
  const indexPath = path.join(projectRoot, 'issues', 'issues.md');
  if (!fs.existsSync(indexPath)) return;

  const content = fs.readFileSync(indexPath, 'utf-8');
  const lines = content.split('\n');
  const updated = lines.map(line => {
    const match = line.match(new RegExp(`^\\|\\s*${issueId}\\s*\\|`));
    if (!match) return line;
    const parts = line.split('|').map(c => c.trim());
    parts[3] = newStatus;
    return `| ${parts[1]} | ${parts[2]} | ${parts[3]} | ${parts[4] || ''} |`;
  });

  fs.writeFileSync(indexPath, updated.join('\n'));
}
