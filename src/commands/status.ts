import { findProjectRoot } from '../core/config.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

interface IssueEntry {
  id: string;
  title: string;
  status: string;
  prUrl?: string;
}

interface BugEntry {
  id: string;
  title: string;
  status: string;
  blockReason?: string;
}

const ISSUES_DIR = 'issues';
const ISSUES_INDEX = 'issues.md';
const BUGS_INDEX = 'bugs.md';

export async function statusCommand(issueId?: string): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Error: Not in an orb project.'));
    process.exit(1);
  }

  const index = readIssuesIndex(projectRoot);
  if (index.length === 0) {
    console.log(chalk.gray('No issues found.'));
    console.log();
    console.log(`  Create one with: ${chalk.cyan('orbc ic "title"')}`);
    return;
  }

  if (!issueId) {
    showAllIssues(index);
  } else {
    showIssueDetail(projectRoot, issueId, index);
  }
}

function readIssuesIndex(projectRoot: string): IssueEntry[] {
  const indexPath = path.join(projectRoot, ISSUES_DIR, ISSUES_INDEX);
  if (!fs.existsSync(indexPath)) return [];

  const content = fs.readFileSync(indexPath, 'utf-8');
  const entries: IssueEntry[] = [];
  for (const line of content.split('\n')) {
    // Match 3 or 4 columns: | ID | Title | Status | [PR] |
    const match = line.match(/^\|\s*(f\d+)\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|(?:\s*(.*?)\s*\|)?$/);
    if (match) {
      entries.push({
        id: match[1],
        title: match[2].trim(),
        status: match[3],
        prUrl: match[4]?.trim() || undefined,
      });
    }
  }
  return entries;
}

function readBugsIndex(projectRoot: string, issueId: string): BugEntry[] {
  const bugsPath = path.join(projectRoot, ISSUES_DIR, issueId, BUGS_INDEX);
  if (!fs.existsSync(bugsPath)) return [];

  const content = fs.readFileSync(bugsPath, 'utf-8');
  const entries: BugEntry[] = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|\s*(.*?)\s*\|/);
    if (match) {
      entries.push({
        id: match[1],
        title: match[2].trim(),
        status: match[3],
        blockReason: match[4].trim() || undefined,
      });
    }
  }
  return entries;
}

function showAllIssues(entries: IssueEntry[]): void {
  console.log(chalk.bold('Issues:\n'));
  for (const entry of entries) {
    const icon = statusIcon(entry.status);
    const pr = entry.prUrl ? chalk.underline(`\n      ${entry.prUrl}`) : '';
    console.log(`  ${icon} ${chalk.cyan(entry.id)}  ${entry.title}  ${chalk.gray(`(${entry.status})`)}${pr}`);
  }
  console.log();
}

function showIssueDetail(projectRoot: string, issueId: string, allIssues: IssueEntry[]): void {
  const issue = allIssues.find(e => e.id === issueId);
  if (!issue) {
    console.error(chalk.red(`Error: Issue ${issueId} not found.`));
    process.exit(1);
  }

  const icon = statusIcon(issue.status);
  console.log(chalk.bold(`Issue ${issueId}`));
  console.log(`  ${icon}  ${issue.title}`);
  console.log(`  ${chalk.gray('Status:')}  ${issue.status}`);
  if (issue.prUrl) {
    console.log(`  ${chalk.gray('PR:')}     ${chalk.underline(issue.prUrl)}`);
  }
  console.log();

  const bugs = readBugsIndex(projectRoot, issueId);
  if (bugs.length === 0) {
    console.log(chalk.gray('  No bugs recorded yet.'));
  } else {
    const counts = countByStatus(bugs);
    console.log(chalk.bold(`  Bugs (${bugs.length} total):`));
    console.log(`    ${chalk.red('✖')} unresolved: ${counts.unresolved}`);
    console.log(`    ${chalk.yellow('◷')} pending_verification: ${counts.pending_verification}`);
    console.log(`    ${chalk.green('✔')} resolved: ${counts.resolved}`);
    console.log(`    ${chalk.gray('⊘')} blocked: ${counts.blocked}`);

    if (counts.unresolved + counts.pending_verification + counts.blocked > 0) {
      console.log();
      for (const bug of bugs) {
        const bIcon = bugStatusIcon(bug.status);
        const reason = bug.blockReason ? chalk.gray(` — ${bug.blockReason}`) : '';
        console.log(`    ${bIcon} #${bug.id}  ${bug.title}  ${chalk.gray(`(${bug.status})`)}${reason}`);
      }
    }
  }
  console.log();
}

function countByStatus(bugs: BugEntry[]) {
  return {
    unresolved: bugs.filter(b => b.status === 'unresolved').length,
    pending_verification: bugs.filter(b => b.status === 'pending_verification').length,
    resolved: bugs.filter(b => b.status === 'resolved').length,
    blocked: bugs.filter(b => b.status === 'blocked').length,
  };
}

function statusIcon(status: string): string {
  switch (status) {
    case 'defining': return chalk.blue('◉');
    case 'designing': return chalk.magenta('◉');
    case 'coding': return chalk.yellow('◉');
    case 'reviewing': return chalk.cyan('◉');
    case 'merging': return chalk.blue('◉');
    case 'done': return chalk.green('✔');
    default: return chalk.gray('○');
  }
}

function bugStatusIcon(status: string): string {
  switch (status) {
    case 'unresolved': return chalk.red('✖');
    case 'pending_verification': return chalk.yellow('◷');
    case 'resolved': return chalk.green('✔');
    case 'blocked': return chalk.gray('⊘');
    default: return ' ';
  }
}
