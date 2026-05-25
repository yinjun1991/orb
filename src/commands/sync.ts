import { findProjectRoot, parseOrbConfig } from '../core/config.js';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';

export async function syncCommand(): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Error: Not in an orb project. No .orb.yaml or AGENTS.md found.'));
    process.exit(1);
  }

  const configPath = path.join(projectRoot, '.orb.yaml');
  if (!fs.existsSync(configPath)) {
    console.error(chalk.red('Error: .orb.yaml not found.'));
    process.exit(1);
  }

  const config = parseOrbConfig(fs.readFileSync(configPath, 'utf-8'));
  if (config.repos.length === 0) {
    console.error(chalk.red('Error: No repos configured in .orb.yaml.'));
    process.exit(1);
  }

  console.log(chalk.gray(`Syncing ${config.repos.length} repo(s)...\n`));

  for (const repo of config.repos) {
    const repoPath = path.resolve(projectRoot, repo.path);
    const spinner = ora(`${chalk.cyan(repo.path)}`).start();

    try {
      syncRepo(repoPath, repo.base_branch);
      spinner.succeed(`${chalk.cyan(repo.path)} → ${repo.base_branch} (${getShortHash(repoPath, repo.base_branch)})`);
    } catch (err: any) {
      spinner.fail(`${chalk.red(repo.path)}: ${err.message}`);
      console.error(chalk.red(`\nSync aborted. Fix the issue above and try again.`));
      process.exit(1);
    }
  }

  console.log(`\n${chalk.green('All repos synced.')}`);
}

function syncRepo(repoPath: string, baseBranch: string): void {
  // Check for local changes
  const status = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8' });
  if (status.trim()) {
    throw new Error('local changes detected — commit or stash them first');
  }

  // Fetch latest from remote
  execSync('git fetch origin', { cwd: repoPath, stdio: 'pipe' });

  // Checkout base branch
  execSync(`git checkout ${baseBranch}`, { cwd: repoPath, stdio: 'pipe' });

  // Fast-forward to latest
  execSync(`git pull --ff-only origin ${baseBranch}`, { cwd: repoPath, stdio: 'pipe' });
}

function getShortHash(repoPath: string, branch: string): string {
  const hash = execSync(`git rev-parse --short ${branch}`, { cwd: repoPath, encoding: 'utf-8' });
  return hash.trim();
}
