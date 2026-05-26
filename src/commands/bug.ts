import { findProjectRoot } from '../core/config.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export async function bugAddCommand(issueId: string, title: string): Promise<void> {
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

  const bugsDir = path.join(issueDir, 'bugs');
  fs.ensureDirSync(bugsDir);

  const nextNum = getNextBugNumber(bugsDir);
  const bugFile = path.join(bugsDir, `bug${nextNum}.md`);
  const bugContent = [
    `# Bug #${nextNum}: ${title}`,
    '',
    '- **Severity**: ',
    '- **Related files**:',
    '  - ',
    '- **Description**: ',
    '- **Expected**: ',
    '- **Actual** (if applicable): ',
    '',
    '## History',
    '',
    '### Round 1',
    '',
    '- **Review**: ',
    '- **Fix**: _To be filled by developer._',
    '',
  ].join('\n');
  fs.writeFileSync(bugFile, bugContent);

  const indexPath = path.join(issueDir, 'bugs.md');
  const row = `| ${nextNum} | ${title} | unresolved | |\n`;
  fs.appendFileSync(indexPath, row);

  console.log(`${chalk.red('✖')} bug #${nextNum} → ${title}`);
  console.log(`  ${chalk.gray(`Created issues/${issueId}/bugs/bug${nextNum}.md`)}`);
  console.log(`  ${chalk.gray(`Updated issues/${issueId}/bugs.md`)}`);
}

export async function bugBlockCommand(issueId: string, bugNums: string, reason?: string): Promise<void> {
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
        const cells = line.split('|').map(c => c.trim());
        cells[3] = 'blocked';
        cells[4] = reason || '';
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
  console.log(`  ${chalk.gray(`Updated issues/${issueId}/bugs.md`)}`);
}

function getNextBugNumber(bugsDir: string): number {
  if (!fs.existsSync(bugsDir)) return 1;

  let max = 0;
  for (const file of fs.readdirSync(bugsDir)) {
    const match = file.match(/^bug(\d+)\.md$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return max + 1;
}

function parseBugNumbers(input: string): number[] {
  return input
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => parseInt(s, 10))
    .filter(n => !isNaN(n));
}
