import { findProjectRoot, parseOrbConfig } from '../core/config.js';
import { runAgent, AgentType } from '../core/adapter.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

export async function codeCommand(issueId: string): Promise<void> {
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

  // Verify issue exists
  const issueDir = path.join(projectRoot, 'issues', issueId);
  if (!fs.existsSync(issueDir)) {
    console.error(chalk.red(`Error: Issue ${issueId} not found.`));
    process.exit(1);
  }

  // Check required files
  const planFile = path.join(issueDir, 'code_plan.md');
  if (!fs.existsSync(planFile)) {
    console.error(chalk.red(`Error: ${planFile} not found. Run the design phase first.`));
    process.exit(1);
  }

  // Determine worktree path (use first repo in config)
  const repoName = path.basename(config.repos[0].path);
  const worktreePath = path.join(projectRoot, 'worktrees', issueId, repoName);

  // Update status to coding
  updateIssueStatus(projectRoot, issueId, 'coding');

  const agent: AgentType = config.coding_agent ?? config.agent;

  console.log(chalk.bold(`Coding ${issueId}`));
  console.log();
  console.log(`  ${chalk.gray('Skill:')}    orb-developer`);
  console.log(`  ${chalk.gray('Workdir:')}  worktrees/${issueId}/${repoName}`);
  console.log(`  ${chalk.gray('Agent:')}    ${agent}`);
  console.log();

  const spinner = ora('Running developer agent...').start();

  try {
    await runAgent(agent, {
      skill: 'orb-developer',
      workdir: worktreePath,
      prompt: buildCodePrompt(issueId),
      contextFiles: [
        `issues/${issueId}/tech_design.md`,
        `issues/${issueId}/code_plan.md`,
        `issues/${issueId}/base_version.json`,
      ],
    });

    spinner.succeed('Coding complete');
    console.log();
    console.log(`  ${chalk.gray('Status:')} coding`);
    console.log(`  Next: ${chalk.cyan(`orbc review ${issueId}`)}`);
  } catch (err: any) {
    spinner.fail(`Coding failed: ${err.message}`);
    process.exit(1);
  }
}

function buildCodePrompt(issueId: string): string {
  return [
    `Implement issue ${issueId} according to the code plan.`,
    '',
    'Before writing any code:',
    `1. Read issues/${issueId}/tech_design.md to understand the design`,
    `2. Read issues/${issueId}/code_plan.md for the step-by-step plan`,
    `3. Read issues/${issueId}/base_version.json to find the base commit`,
    '',
    'Then execute each step in the code plan sequentially.',
    'After coding, run existing tests and verify your changes.',
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
    return line.replace(/\|\s*\S+\s*\|$/, `| ${newStatus} |`);
  });

  fs.writeFileSync(indexPath, updated.join('\n'));
}
