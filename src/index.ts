#!/usr/bin/env node

import { Command } from 'commander';
import { icCommand } from './commands/ic.js';
import { syncCommand } from './commands/sync.js';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = fs.readJSONSync(path.join(__dirname, '..', 'package.json'));

const program = new Command();

program
  .name('orbc')
  .description('CLI tool for orchestrating AI agents across the full development pipeline')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize an orb project by creating .orb.yaml')
  .action(async () => {
    await initCommand();
  });

program
  .command('ic')
  .description('Create a new issue')
  .argument('<title>', 'issue title')
  .action(async (title: string) => {
    await icCommand(title);
  });

program
  .command('sync')
  .description('Sync all repos to latest on their base branches')
  .action(async () => {
    await syncCommand();
  });

program
  .command('status')
  .description('Show issue status and bug list')
  .argument('[issueId]', 'issue ID (e.g. f1), omit to list all issues')
  .action(async (issueId?: string) => {
    await statusCommand(issueId);
  });

program.parse();
