import { findProjectRoot, parseOrbConfig } from '../core/config.js';
import { getNextIssueId, createIssue } from '../core/issue.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

export async function icCommand(title: string): Promise<void> {
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

  const issueId = getNextIssueId(projectRoot);
  const spinner = ora(`Creating issue ${chalk.cyan(issueId)}: ${title}`).start();

  try {
    createIssue(projectRoot, issueId, title, config.repos);
    spinner.succeed(`Issue ${chalk.cyan(issueId)} created: ${title}`);
    console.log();
    console.log(`  ${chalk.gray('Issue directory:')} issues/${issueId}/`);
    console.log(`  ${chalk.gray('Worktree:')}       worktrees/${issueId}/`);
    console.log(`  ${chalk.gray('Status:')}          defining`);
    console.log();
    console.log(`  Next: define requirements with ${chalk.cyan('/orb-requirement-analyst')}`);
  } catch (err: any) {
    spinner.fail(`Failed to create issue: ${err.message}`);
    process.exit(1);
  }
}
