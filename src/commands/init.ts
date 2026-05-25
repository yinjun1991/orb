import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const CONFIG_TEMPLATE = `# orb project configuration
agent: cc

repos:
  # - path: ./repos/<repo-name>
  #   base_branch: main
  #   remote: origin

max_review_rounds: 3
`;

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();
  const configPath = path.join(cwd, '.orb.yaml');

  if (fs.existsSync(configPath)) {
    console.error(chalk.yellow(`Warning: .orb.yaml already exists in ${cwd}`));
    console.error(chalk.gray('Remove it first if you want to regenerate.'));
    process.exit(1);
  }

  fs.writeFileSync(configPath, CONFIG_TEMPLATE);
  console.log(chalk.green(`Created .orb.yaml in ${cwd}`));
  console.log();
  console.log(`  ${chalk.gray('Edit it to configure your repos:')}`);
  console.log(`  ${chalk.cyan('repos:')}`);
  console.log(`    ${chalk.cyan('- path:')} ./repos/<repo-name>`);
  console.log(`      ${chalk.cyan('base_branch:')} main   ${chalk.gray('# required')}`);
  console.log(`      ${chalk.cyan('remote:')} origin      ${chalk.gray('# optional, defaults to origin')}`);
}
