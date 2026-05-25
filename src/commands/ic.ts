import { findProjectRoot, getNextIssueId, createIssue } from '../core/issue.js';
import { OrbConfig } from '../types.js';
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

  // Read config
  const configPath = path.join(projectRoot, '.orb.yaml');
  let config: OrbConfig | null = null;
  if (fs.existsSync(configPath)) {
    config = parseOrbConfig(fs.readFileSync(configPath, 'utf-8'));
  }

  if (!config || config.repos.length === 0) {
    console.error(chalk.red('Error: .orb.yaml is missing or has no repos configured.'));
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

function parseOrbConfig(content: string): OrbConfig {
  const config: OrbConfig = { agent: 'cc', repos: [] };

  const lines = content.split('\n');
  let currentRepo: Record<string, string> | null = null;
  let repoIndex = 0;

  function finalizeRepo() {
    if (!currentRepo) return;
    repoIndex++;

    // Validate required fields
    if (!currentRepo.path) {
      console.error(chalk.red(`Error: repo #${repoIndex} in .orb.yaml is missing "path".`));
      process.exit(1);
    }
    if (!currentRepo.base_branch) {
      console.error(chalk.red(`Error: repo "${currentRepo.path}" in .orb.yaml is missing "base_branch".`));
      process.exit(1);
    }

    // Default remote to 'origin'
    if (!currentRepo.remote) {
      currentRepo.remote = 'origin';
    }

    config.repos.push(currentRepo as any);
    currentRepo = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('agent:')) {
      const val = trimmed.split(':')[1]?.trim().replace(/"/g, '');
      if (val === 'cc' || val === 'codex') config.agent = val;
    } else if (trimmed.startsWith('max_review_rounds:')) {
      config.max_review_rounds = parseInt(trimmed.split(':')[1]?.trim() || '3', 10);
    } else if (trimmed === 'repos:') {
      // beginning of repos list
    } else if (trimmed.startsWith('- path:')) {
      finalizeRepo();
      currentRepo = { path: extractYamlValue(trimmed, 'path') };
    } else if (currentRepo) {
      if (trimmed.startsWith('remote:')) currentRepo.remote = extractYamlValue(trimmed, 'remote');
      else if (trimmed.startsWith('base_branch:')) currentRepo.base_branch = extractYamlValue(trimmed, 'base_branch');
    }
  }
  finalizeRepo();

  return config;
}

function extractYamlValue(line: string, key: string): string {
  const val = line.split(':').slice(1).join(':').trim();
  return val.replace(/^["']|["']$/g, '');
}
