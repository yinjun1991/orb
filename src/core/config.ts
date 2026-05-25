import fs from 'fs-extra';
import path from 'path';
import { OrbConfig } from '../types.js';

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
  const config: OrbConfig = { agent: 'cc', repos: [] };
  const lines = content.split('\n');
  let currentRepo: Record<string, string> | null = null;
  let repoIndex = 0;

  function finalizeRepo() {
    if (!currentRepo) return;
    repoIndex++;

    if (!currentRepo.path) {
      console.error(`Error: repo #${repoIndex} in .orb.yaml is missing "path".`);
      process.exit(1);
    }
    if (!currentRepo.base_branch) {
      console.error(`Error: repo "${currentRepo.path}" in .orb.yaml is missing "base_branch".`);
      process.exit(1);
    }
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
