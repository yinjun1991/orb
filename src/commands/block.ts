import { findProjectRoot } from '../core/config.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export async function blockCommand(issueId: string, bugNums: string): Promise<void> {
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

  const indexPath = path.join(issueDir, 'bugs.md');
  if (!fs.existsSync(indexPath)) {
    console.error(chalk.red(`Error: ${indexPath} not found.`));
    process.exit(1);
  }

  const numbers = parseBugNumbers(bugNums);
  const content = fs.readFileSync(indexPath, 'utf-8');
  const lines = content.split('\n');
  const updated = lines.map(line => {
    for (const num of numbers) {
      const match = line.match(new RegExp(`^\\|\\s*${num}\\s*\\|`));
      if (match) {
        return line.replace(/\|\s*\S+\s*\|$/, '| blocked |');
      }
    }
    return line;
  });

  fs.writeFileSync(indexPath, updated.join('\n'));

  for (const num of numbers) {
    console.log(`${chalk.gray('⊘')} bug #${num} → blocked`);
  }
  console.log();
  console.log(`  Updated issues/${issueId}/bugs.md`);
}

function parseBugNumbers(input: string): number[] {
  return input
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => parseInt(s, 10))
    .filter(n => !isNaN(n));
}
