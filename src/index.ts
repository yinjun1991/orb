#!/usr/bin/env node

import { Command } from 'commander';
import { icCommand } from './commands/ic.js';
import { syncCommand } from './commands/sync.js';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { codeCommand } from './commands/code.js';
import { reviewCommand } from './commands/review.js';
import { bugAddCommand, bugBlockCommand } from './commands/bug.js';
import { cleanCommand } from './commands/clean.js';
import { prCommand } from './commands/pr.js';
import { dropCommand } from './commands/drop.js';
import { installSkillsCommand } from './commands/install-skills.js';
import { openCommand } from './commands/open.js';
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
  .command('install-skills')
  .description('Install orb skills for Claude Code and Codex')
  .option('--global', 'Install globally to ~/, instead of project root')
  .action(async (opts) => {
    await installSkillsCommand({ global: opts.global });
  });

program
  .command('ic')
  .description('Create a new issue')
  .argument('<title>', 'issue title')
  .action(async (title: string) => {
    await icCommand(title);
  })
  .addHelpText('after', '\nExample:\n  orbc ic "Add user authentication"');

program
  .command('sync')
  .description('Sync all repos to latest on their base branches')
  .action(async () => {
    await syncCommand();
  });

program
  .command('status')
  .description('Show issue status and bug list')
  .argument('[issueId]', 'issue ID with f-prefix (e.g. f1), omit to list all')
  .action(async (issueId?: string) => {
    await statusCommand(issueId);
  })
  .addHelpText('after', '\nExamples:\n  orbc status          # list all issues\n  orbc status f1       # show f1 detail');

program
  .command('open')
  .description('Open an issue workspace in VS Code')
  .argument('<issueId>', 'issue ID with f-prefix (e.g. f1)')
  .action(async (issueId: string) => {
    await openCommand(issueId);
  })
  .addHelpText('after', '\nExample:\n  orbc open f1');

program
  .command('code')
  .description('Run the developer agent on an issue')
  .argument('<issueId>', 'issue ID with f-prefix (e.g. f1)')
  .action(async (issueId: string) => {
    await codeCommand(issueId);
  })
  .addHelpText('after', '\nExample:\n  orbc code f1');

program
  .command('review')
  .description('Run the review→fix loop on an issue')
  .argument('<issueId>', 'issue ID with f-prefix (e.g. f1)')
  .action(async (issueId: string) => {
    await reviewCommand(issueId);
  })
  .addHelpText('after', '\nExample:\n  orbc review f1');

const bugCmd = program
  .command('bug')
  .description('Manage bugs for an issue');

bugCmd
  .command('add')
  .description('Add a bug to an issue')
  .argument('<issueId>', 'issue ID with f-prefix (e.g. f1)')
  .argument('<title>', 'bug title')
  .action(async (issueId: string, title: string) => {
    await bugAddCommand(issueId, title);
  });

bugCmd
  .command('block')
  .description('Block bugs to skip them in review')
  .argument('<issueId>', 'issue ID with f-prefix (e.g. f1)')
  .argument('<bugNums>', 'bug numbers, comma-separated (e.g. 1,2,3)')
  .argument('[reason]', 'reason for blocking (optional)')
  .action(async (issueId: string, bugNums: string, reason?: string) => {
    await bugBlockCommand(issueId, bugNums, reason);
  });

program
  .command('pr')
  .description('Push branch and create a GitHub PR to base_branch')
  .argument('<issueId>', 'issue ID with f-prefix (e.g. f1)')
  .action(async (issueId: string) => {
    await prCommand(issueId);
  })
  .addHelpText('after', '\nExample:\n  orbc pr f1');

program
  .command('clean')
  .description('Remove worktree and mark issue as done')
  .argument('<issueId>', 'issue ID with f-prefix (e.g. f1)')
  .action(async (issueId: string) => {
    await cleanCommand(issueId);
  })
  .addHelpText('after', '\nExample:\n  orbc clean f1');

program
  .command('drop')
  .description('Permanently delete an issue and its worktree')
  .argument('<issueId>', 'issue ID with f-prefix (e.g. f1)')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (issueId: string, opts) => {
    await dropCommand(issueId, { force: opts.force });
  })
  .addHelpText('after', '\nExamples:\n  orbc drop f1         # prompts for confirmation\n  orbc drop f1 -f      # force, no confirmation');

program.parse();
