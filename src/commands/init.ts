import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();
  const configPath = path.join(cwd, '.orb.yaml');

  if (fs.existsSync(configPath)) {
    console.error(chalk.yellow(`Warning: .orb.yaml already exists in ${cwd}`));
    console.error(chalk.gray('Remove it first if you want to regenerate.'));
    process.exit(1);
  }

  const repos = discoverRepos(cwd);
  const content = generateConfig(repos);

  fs.writeFileSync(configPath, content);
  console.log(chalk.green(`Created .orb.yaml in ${cwd}`));

  if (repos.length > 0) {
    console.log();
    console.log(`  ${chalk.gray('Auto-detected')} ${repos.length} ${chalk.gray('repo(s):')}`);
    for (const r of repos) {
      console.log(`    ${chalk.cyan(r.path)} ${chalk.gray(`(${r.branch})`)}`);
    }
  } else {
    console.log();
    console.log(`  ${chalk.gray('No repos/ found. Add repos to .orb.yaml manually.')}`);
  }
}

interface DetectedRepo {
  path: string;
  branch: string;
}

function discoverRepos(cwd: string): DetectedRepo[] {
  const reposDir = path.join(cwd, 'repos');
  if (!fs.existsSync(reposDir) || !fs.statSync(reposDir).isDirectory()) return [];

  const repos: DetectedRepo[] = [];
  for (const entry of fs.readdirSync(reposDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const repoPath = path.join(reposDir, entry.name);
    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) continue;

    const branch = detectDefaultBranch(repoPath);
    repos.push({ path: `./repos/${entry.name}`, branch });
  }
  return repos;
}

function detectDefaultBranch(repoPath: string): string {
  try {
    // Get the actual HEAD branch name
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoPath, encoding: 'utf-8', stdio: 'pipe',
    }).trim();
    // If HEAD is detached (shows "HEAD"), fall back to common names
    if (branch === 'HEAD') {
      return detectFromRefs(repoPath);
    }
    return branch;
  } catch {
    return 'main';
  }
}

function detectFromRefs(repoPath: string): string {
  for (const name of ['main', 'master', 'dev', 'develop']) {
    try {
      execSync(`git rev-parse --verify ${name}`, {
        cwd: repoPath, encoding: 'utf-8', stdio: 'pipe',
      });
      return name;
    } catch {
      // branch doesn't exist, try next
    }
  }
  return 'main';
}

function generateConfig(repos: DetectedRepo[]): string {
  let config = `# orb project configuration
agent: cc

repos:
`;

  if (repos.length > 0) {
    for (const repo of repos) {
      config += `  - path: ${repo.path}\n`;
      config += `    base_branch: ${repo.branch}\n`;
      config += `    remote: origin\n`;
      config += `\n`;
    }
  } else {
    config += `  # - path: ./repos/<repo-name>\n`;
    config += `  #   base_branch: main\n`;
    config += `  #   remote: origin\n`;
    config += `\n`;
  }

  config += `max_review_rounds: 3\n`;
  return config;
}
