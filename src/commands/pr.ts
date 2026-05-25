import { findProjectRoot, parseOrbConfig } from '../core/config.js';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';

export async function prCommand(issueId: string): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Error: Not in an orb project.'));
    process.exit(1);
  }

  const configPath = path.join(projectRoot, '.orb.yaml');
  if (!fs.existsSync(configPath)) {
    console.error(chalk.red('Error: .orb.yaml not found.'));
    process.exit(1);
  }
  const config = parseOrbConfig(fs.readFileSync(configPath, 'utf-8'));

  const issueDir = path.join(projectRoot, 'issues', issueId);
  if (!fs.existsSync(issueDir)) {
    console.error(chalk.red(`Error: Issue ${issueId} not found.`));
    process.exit(1);
  }

  // Read issue title for PR title
  const issueMd = fs.readFileSync(path.join(issueDir, 'issue.md'), 'utf-8');
  const titleMatch = issueMd.match(/^# (.+)$/m);
  const prTitle = titleMatch?.[1] || issueId;

  const urls: { repo: string; url: string }[] = [];

  for (const repo of config.repos) {
    const repoPath = path.resolve(projectRoot, repo.path);
    const worktreePath = path.join(projectRoot, 'worktrees', issueId, path.basename(repo.path));
    const baseBranch = repo.base_branch;
    const remote = repo.remote || 'origin';

    if (!fs.existsSync(worktreePath)) {
      console.error(chalk.yellow(`Warning: worktree not found for ${repo.path}, skipping.`));
      continue;
    }

    const spinner = ora(`${chalk.cyan(repo.path)}: pushing and creating PR`).start();

    try {
      execSync(`git push ${remote} ${issueId}`, {
        cwd: worktreePath,
        stdio: 'pipe',
      });

      const result = execSync(
        `gh pr create --base ${baseBranch} --head ${issueId} --title "${prTitle}" --body "Closes ${issueId}"`,
        { cwd: worktreePath, encoding: 'utf-8', stdio: 'pipe' },
      ).trim();

      spinner.succeed(`${chalk.cyan(repo.path)}: ${result}`);
      urls.push({ repo: path.basename(repo.path), url: result });
    } catch (err: any) {
      spinner.fail(`${chalk.red(repo.path)}: ${err.stderr?.trim() || err.message}`);
    }
  }

  if (urls.length === 0) {
    console.error(chalk.red('No PRs created.'));
    process.exit(1);
  }

  // Write PR URLs to issue directory
  const prJson: Record<string, string> = {};
  for (const { repo, url } of urls) {
    prJson[repo] = url;
  }
  fs.writeFileSync(path.join(issueDir, 'pr_urls.json'), JSON.stringify(prJson, null, 2) + '\n');

  // Update issues.md: add PR column if missing, update status + PR URLs
  updateIssuesIndex(projectRoot, issueId, urls);

  console.log();
  console.log(chalk.green(`Created ${urls.length} PR(s):`));
  for (const { repo, url } of urls) {
    console.log(`  ${chalk.cyan(repo)}: ${chalk.underline(url)}`);
  }
}

function updateIssuesIndex(projectRoot: string, issueId: string, urls: { repo: string; url: string }[]): void {
  const indexPath = path.join(projectRoot, 'issues', 'issues.md');
  if (!fs.existsSync(indexPath)) return;

  const content = fs.readFileSync(indexPath, 'utf-8');
  const lines = content.split('\n');
  const urlText = urls.map(u => `${u.repo}: ${u.url}`).join(', ');

  const updated = lines.map(line => {
    const match = line.match(new RegExp(`^\\|\\s*${issueId}\\s*\\|`));
    if (!match) return line;

    // Reconstruct: cells[1]=ID, cells[2]=Title, cells[3]=Status, cells[4]=PR
    const parts = line.split('|').map(c => c.trim());
    parts[3] = 'merging';
    parts[4] = urlText;
    return `| ${parts[1]} | ${parts[2]} | ${parts[3]} | ${parts[4]} |`;
  });

  fs.writeFileSync(indexPath, updated.join('\n'));
}
