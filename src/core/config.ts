import fs from 'fs-extra';
import path from 'path';
import YAML from 'yaml';
import { OrbConfig, RepoConfig } from '../types.js';

/**
 * Find the project root by looking for .orb.yaml or AGENTS.md upward.
 */
export function findProjectRoot(cwd: string = process.cwd()): string | null {
  let dir = cwd;
  while (true) {
    if (fs.existsSync(path.join(dir, '.orb.yaml')) || fs.existsSync(path.join(dir, 'AGENTS.md'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Parse .orb.yaml content into OrbConfig.
 * Validates required fields per repo: path and base_branch are required, remote defaults to 'origin'.
 */
export function parseOrbConfig(content: string): OrbConfig {
  let raw: any;
  try {
    raw = YAML.parse(content);
  } catch (err: any) {
    console.error(`Error: Invalid .orb.yaml: ${err.message}`);
    process.exit(1);
  }

  if (!raw || typeof raw !== 'object') {
    console.error('Error: .orb.yaml is empty or invalid.');
    process.exit(1);
  }

  const config: OrbConfig = {
    agent: validateAgent(raw.agent, 'agent') || 'cc',
    repos: [],
  };

  if (raw.coding_agent !== undefined) {
    config.coding_agent = validateAgent(raw.coding_agent, 'coding_agent');
  }
  if (raw.review_agent !== undefined) {
    config.review_agent = validateAgent(raw.review_agent, 'review_agent');
  }
  if (raw.max_review_rounds !== undefined) {
    config.max_review_rounds = raw.max_review_rounds;
  }

  if (!Array.isArray(raw.repos) || raw.repos.length === 0) {
    console.error('Error: .orb.yaml must have a "repos" list with at least one repo.');
    process.exit(1);
  }

  for (let i = 0; i < raw.repos.length; i++) {
    config.repos.push(validateRepo(raw.repos[i], i + 1));
  }

  return config;
}

function validateAgent(val: any, field: string): 'cc' | 'codex' | undefined {
  if (val === 'cc' || val === 'codex') return val;
  console.error(`Error: .orb.yaml "${field}" must be "cc" or "codex", got "${val}".`);
  process.exit(1);
}

function validateRepo(raw: any, index: number): RepoConfig {
  if (!raw || typeof raw !== 'object') {
    console.error(`Error: repo #${index} in .orb.yaml is invalid.`);
    process.exit(1);
  }
  if (!raw.path) {
    console.error(`Error: repo #${index} in .orb.yaml is missing "path".`);
    process.exit(1);
  }
  if (!raw.base_branch) {
    console.error(`Error: repo "${raw.path}" in .orb.yaml is missing "base_branch".`);
    process.exit(1);
  }

  const repo: RepoConfig = {
    path: raw.path,
    base_branch: raw.base_branch,
    remote: raw.remote || 'origin',
  };

  if (Array.isArray(raw.copy_files)) {
    repo.copy_files = raw.copy_files;
  }

  return repo;
}
