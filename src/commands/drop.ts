import { findProjectRoot, parseOrbConfig } from '../core/config.js';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import * as readline from 'readline';

export async function dropCommand(issueId: string): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Error: Not in an orb project.'));
    process.exit(1);
  }

  const issueDir = path.join(projectRoot, 'issues', issueId);
  if (!fs.existsSync(issueDir)) {
    console.error(chalk.red(`Error: Issue ${issueId} not found.`));
    process.exit(1);
  }

  // Read issue title for confirmation
  const issueMd = fs.readFileSync(path.join(issueDir, 'issue.md'), 'utf-8');
  const titleMatch = issueMd.match(/^# (.+)$/m);
  const title = titleMatch?.[1] || issueId;

  console.log(chalk.bold(`Drop issue ${issueId}: ${title}`));
  console.log();
  console.log(chalk.red('  This will permanently delete:'));
  console.log(`    ${chalk.gray('•')} issues/${issueId}/   (all docs, bugs, code plan)`);
  console.log(`    ${chalk.gray('•')} worktrees/${issueId}/ (all uncommitted work)`);
  console.log(`    ${chalk.gray('•')} the ${issueId} entry from issues.md`);
  console.log();
  console.log(chalk.red('  This cannot be undone.'));

  const confirmed = await confirm(chalk.red(`Type "${issueId}" to confirm: `), issueId);
  if (!confirmed) {
    console.log(chalk.gray('Cancelled.'));
    return;
  }

  // Remove worktrees
  const configPath = path.join(projectRoot, '.orb.yaml');
  if (fs.existsSync(configPath)) {
    const config = parseOrbConfig(fs.readFileSync(configPath, 'utf-8'));
    const worktreeDir = path.join(projectRoot, 'worktrees', issueId);
    if (fs.existsSync(worktreeDir)) {
      for (const repo of config.repos) {
        const repoPath = path.resolve(projectRoot, repo.path);
        const wtPath = path.join(worktreeDir, path.basename(repo.path));
        const remote = repo.remote || 'origin';
        if (!fs.existsSync(wtPath)) continue;
        try {
          execSync(`git worktree remove ${wtPath} --force`, { cwd: repoPath, stdio: 'pipe' });
        } catch { /* already removed */ }
        try {
          execSync(`git branch -D ${issueId}`, { cwd: repoPath, stdio: 'pipe' });
        } catch { /* branch already gone */ }
        try {
          execSync(`git push ${remote} --delete ${issueId}`, { cwd: repoPath, stdio: 'pipe' });
        } catch { /* not pushed or already deleted */ }
      }
      fs.removeSync(worktreeDir);
    }
  }

  // Remove issue directory
  fs.removeSync(issueDir);

  // Remove from issues.md
  removeFromIndex(projectRoot, issueId);

  console.log();
  console.log(chalk.gray(`${issueId} dropped.`));
}

function confirm(prompt: string, expected: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() === expected);
    });
  });
}

function removeFromIndex(projectRoot: string, issueId: string): void {
  const indexPath = path.join(projectRoot, 'issues', 'issues.md');
  if (!fs.existsSync(indexPath)) return;

  const content = fs.readFileSync(indexPath, 'utf-8');
  const lines = content.split('\n');
  const filtered = lines.filter(line => {
    return !line.match(new RegExp(`^\\|\\s*${issueId}\\s*\\|`));
  });

  fs.writeFileSync(indexPath, filtered.join('\n'));
}
