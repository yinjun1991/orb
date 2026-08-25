import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { findProjectRoot } from '../core/config.js';

const execFileAsync = promisify(execFile);

export async function openCommand(issueId: string): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Error: Not in an orb project.'));
    process.exit(1);
  }

  const workspaceFile = path.join(projectRoot, 'worktrees', issueId, `${issueId}.code-workspace`);
  if (!fs.existsSync(workspaceFile)) {
    console.error(chalk.red(`Error: Workspace for issue ${issueId} not found: ${workspaceFile}`));
    process.exit(1);
  }

  try {
    await execFileAsync('code', [workspaceFile]);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.error(chalk.red('Error: VS Code CLI "code" not found. Install it from VS Code: Shell Command: Install \'code\' command in PATH.'));
    } else {
      console.error(chalk.red(`Error: Failed to open workspace: ${err.message}`));
    }
    process.exit(1);
  }
}
