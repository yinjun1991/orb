import { findProjectRoot, parseOrbConfig } from '../core/config.js';
import fs from 'fs-extra';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';

const execFileAsync = promisify(execFile);

interface DropWarning {
  repoName: string;
  message: string;
}

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
  const config = fs.existsSync(configPath)
    ? parseOrbConfig(fs.readFileSync(configPath, 'utf-8'))
    : null;

  const warnings: DropWarning[] = [];
  const spinner = ora(`Dropping ${chalk.cyan(issueId)}...`).start();
  try {
    if (config) {
      const worktreeDir = path.join(projectRoot, 'worktrees', issueId);
      const warningGroups = await Promise.all(
        config.repos.map(repo => dropRepo(projectRoot, worktreeDir, issueId, repo.path, repo.remote || 'origin')),
      );
      warnings.push(...warningGroups.flat());

      if (fs.existsSync(worktreeDir)) fs.removeSync(worktreeDir);
    }

    // Remove issue directory (if exists)
    if (fs.existsSync(issueDir)) {
      fs.removeSync(issueDir);
    }

    // Remove from issues.md
    removeFromIndex(projectRoot, issueId);

    if (warnings.length > 0) {
      spinner.succeed(`${chalk.cyan(issueId)} dropped with ${warnings.length} warning(s).`);
      printWarnings(warnings);
    } else {
      spinner.succeed(`${chalk.cyan(issueId)} dropped.`);
    }
  } catch (err: any) {
    spinner.fail(`Failed to drop ${chalk.cyan(issueId)}: ${err.message}`);
    process.exit(1);
  }
}

async function dropRepo(projectRoot: string, worktreeDir: string, issueId: string, repoConfigPath: string, remote: string): Promise<DropWarning[]> {
  const repoPath = path.resolve(projectRoot, repoConfigPath);
  const repoName = path.basename(repoConfigPath);
  const wtPath = path.join(worktreeDir, repoName);
  const warnings: DropWarning[] = [];

  if (fs.existsSync(wtPath)) {
    const warning = await runGit(['worktree', 'remove', wtPath, '--force'], repoPath);
    if (warning) warnings.push({ repoName, message: warning });
  }

  for (const args of [
    ['branch', '-D', issueId],
    ['push', remote, '--delete', issueId],
  ]) {
    const warning = await runGit(args, repoPath);
    if (warning) warnings.push({ repoName, message: warning });
  }

  return warnings;
}

/** Run a git command and return unexpected failures as warnings. */
async function runGit(args: string[], cwd: string): Promise<string | null> {
  try {
    await execFileAsync('git', args, { cwd });
    return null;
  } catch (err: any) {
    const msg = String(err.stderr || err.message || '').trim();
    // Expected: branch not pushed, not yet created, already deleted
    if (msg.includes('remote ref does not exist')) return null;
    if (msg.includes('branch not found')) return null;
    if (/branch ['"].+['"] not found/.test(msg)) return null;
    if (msg.includes('is not a working tree')) return null;
    return msg;
  }
}

function printWarnings(warnings: DropWarning[]): void {
  for (const warning of warnings) {
    console.error(chalk.yellow(`  Warning (${warning.repoName}): ${warning.message}`));
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
