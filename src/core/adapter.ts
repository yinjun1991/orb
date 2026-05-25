import { spawn } from 'child_process';

export type AgentType = 'cc' | 'codex';

export interface RunOptions {
  skill: string;
  prompt: string;
  workdir: string;
  contextFiles: string[];
}

/**
 * Run an AI agent with the given skill and prompt.
 * Skills are loaded from the filesystem (.claude/skills/ or .agents/skills/),
 * installed by `orbc init`. The adapter only passes the prompt — no inline skill content.
 */
export function runAgent(agent: AgentType, opts: RunOptions): Promise<void> {
  if (agent === 'codex') {
    return runCodex(opts);
  }
  return runClaudeCode(opts);
}

function runClaudeCode(opts: RunOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const prompt = buildPrompt(opts);

    // Interactive mode (no -p) — user can intervene when agent asks questions
    const child = spawn('claude', [prompt], {
      stdio: 'inherit',
      cwd: opts.workdir,
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`claude exited with code ${code}`));
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start claude: ${err.message}`));
    });
  });
}

function runCodex(opts: RunOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    // Interactive mode — Codex discovers skills from .agents/skills/
    const prompt = [
      `Use the $${opts.skill} skill.`,
      '',
      buildPrompt(opts),
    ].join('\n');

    const child = spawn('codex', [prompt], {
      stdio: 'inherit',
      cwd: opts.workdir,
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`codex exited with code ${code}`));
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start codex: ${err.message}`));
    });
  });
}

/**
 * Build the prompt that references file paths without inlining content.
 */
function buildPrompt(opts: RunOptions): string {
  const lines: string[] = [
    `Use the ${opts.skill} skill for this task.`,
    '',
    opts.prompt,
  ];

  if (opts.contextFiles.length > 0) {
    lines.push('');
    lines.push('## Context files');
    lines.push('Read the following files for context before starting:');
    lines.push('');
    for (const file of opts.contextFiles) {
      lines.push(`- ${file}`);
    }
  }

  return lines.join('\n');
}
