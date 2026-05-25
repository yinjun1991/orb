import { findProjectRoot } from '../core/config.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export async function blockCommand(issueId: string, bugNums: string, reason?: string): Promise<void> {
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
        // Split into cells, replace status (col 3) and block_reason (col 4)
        const cells = line.split('|').map(c => c.trim());
        // cells: ['', '1', 'Null check', 'unresolved', '', '']
        cells[3] = 'blocked';
        cells[4] = reason || '';
        // Ensure at least 4 data columns
        while (cells.length < 6) cells.push('');
        return `| ${cells[1]} | ${cells[2]} | ${cells[3]} | ${cells[4]} |`;
      }
    }
    return line;
  });

  fs.writeFileSync(indexPath, updated.join('\n'));

  for (const num of numbers) {
    const suffix = reason ? ` — ${reason}` : '';
    console.log(`${chalk.gray('⊘')} bug #${num} → blocked${suffix}`);
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
