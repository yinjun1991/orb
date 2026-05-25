import { findProjectRoot, parseOrbConfig } from '../core/config.js';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import * as readline from 'readline';

export async function dropCommand(issueId: string, opts: { force?: boolean }): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Error: Not in an orb project.'));
    process.exit(1);
  }

  const issueDir = path.join(projectRoot, 'issues', issueId);

  if (!opts.force) {
    let title = issueId;
    if (fs.existsSync(issueDir)) {
      const issueMd = fs.readFileSync(path.join(issueDir, 'issue.md'), 'utf-8');
      const titleMatch = issueMd.match(/^# (.+)$/m);
      if (titleMatch) title = titleMatch[1];
    }

    console.log(chalk.bold(`Drop issue ${issueId}: ${title}`));
    console.log();
    console.log(chalk.red('  This will permanently delete:'));
    if (fs.existsSync(issueDir)) {
      console.log(`    ${chalk.gray('•')} issues/${issueId}/   (all docs, bugs, code plan)`);
    }
    console.log(`    ${chalk.gray('•')} worktrees/${issueId}/ (if exists)`);
    console.log(`    ${chalk.gray('•')} local and remote branch ${issueId} (if exists)`);
    console.log(`    ${chalk.gray('•')} the ${issueId} entry from issues.md`);
    console.log();
    console.log(chalk.red('  This cannot be undone.'));

    const confirmed = await confirm(chalk.red(`Type "${issueId}" to confirm: `), issueId);
    if (!confirmed) {
      console.log(chalk.gray('Cancelled.'));
      return;
    }
  }

  const configPath = path.join(projectRoot, '.orb.yaml');
  if (fs.existsSync(configPath)) {
    const config = parseOrbConfig(fs.readFileSync(configPath, 'utf-8'));

    // Clean worktree
    const worktreeDir = path.join(projectRoot, 'worktrees', issueId);
    if (fs.existsSync(worktreeDir)) {
      for (const repo of config.repos) {
        const repoPath = path.resolve(projectRoot, repo.path);
        const wtPath = path.join(worktreeDir, path.basename(repo.path));
        if (!fs.existsSync(wtPath)) continue;
        runOrWarn(`git worktree remove ${wtPath} --force`, repoPath);
      }
      fs.removeSync(worktreeDir);
    }

    // Delete local + remote branches (always try)
    for (const repo of config.repos) {
      const repoPath = path.resolve(projectRoot, repo.path);
      const remote = repo.remote || 'origin';
      runOrWarn(`git branch -D ${issueId}`, repoPath);
      runOrWarn(`git push ${remote} --delete ${issueId}`, repoPath);
    }
  }

  // Remove issue directory (if exists)
  if (fs.existsSync(issueDir)) {
    fs.removeSync(issueDir);
  }

  // Remove from issues.md
  removeFromIndex(projectRoot, issueId);

  console.log();
  console.log(chalk.gray(`${issueId} dropped.`));
}

/** Run a shell command, print a warning on failure instead of crashing. */
function runOrWarn(cmd: string, cwd: string): void {
  try {
    execSync(cmd, { cwd, stdio: 'pipe' });
  } catch (err: any) {
    const msg = err.stderr?.toString().trim() || err.message || '';
    // Expected: branch not pushed, not yet created, already deleted
    if (msg.includes('remote ref does not exist')) return;
    if (msg.includes('branch not found')) return;
    if (msg.includes('is not a working tree')) return;
    console.error(chalk.yellow(`  Warning: ${msg}`));
  }
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
