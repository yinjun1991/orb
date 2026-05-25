import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

interface SkillInfo {
  name: string;       // from frontmatter, e.g. "orb-developer"
  sourcePath: string; // source file path
}

const SKILL_FILES = [
  'requirement-analyst.md',
  'architect.md',
  'developer.md',
  'code-reviewer.md',
];

export async function installSkillsCommand(): Promise<void> {
  const orbRoot = getOrbRoot();
  const skillsDir = path.join(orbRoot, 'skills');
  const home = os.homedir();

  if (!fs.existsSync(skillsDir)) {
    console.error(chalk.red('Error: skills directory not found in orb package.'));
    process.exit(1);
  }

  // Load all skills
  const skills = loadSkills(skillsDir);

  // Install for Claude Code
  const ccDir = path.join(home, '.claude', 'skills');
  fs.ensureDirSync(ccDir);
  let ccCount = 0;
  for (const skill of skills) {
    const dest = path.join(ccDir, `${skill.name}.md`);
    fs.copyFileSync(skill.sourcePath, dest);
    ccCount++;
  }

  // Install for Codex (Agent Skills standard)
  const codexDir = path.join(home, '.agents', 'skills');
  fs.ensureDirSync(codexDir);
  let codexCount = 0;
  for (const skill of skills) {
    const destDir = path.join(codexDir, skill.name);
    fs.ensureDirSync(destDir);
    fs.copyFileSync(skill.sourcePath, path.join(destDir, 'SKILL.md'));
    codexCount++;
  }

  console.log(chalk.green(`Installed ${skills.length} skill(s):`));
  console.log();
  for (const skill of skills) {
    console.log(`  ${chalk.cyan(`/${skill.name}`)}`);
  }
  console.log();
  console.log(`  ${chalk.gray('Claude Code:')} ~/.claude/skills/  (${ccCount} files)`);
  console.log(`  ${chalk.gray('Codex:')}       ~/.agents/skills/  (${codexCount} dirs)`);
}

function loadSkills(skillsDir: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  for (const file of SKILL_FILES) {
    const sourcePath = path.join(skillsDir, file);
    if (!fs.existsSync(sourcePath)) {
      console.error(chalk.yellow(`Warning: skill file not found: ${file}`));
      continue;
    }
    const name = extractSkillName(sourcePath);
    skills.push({ name, sourcePath });
  }
  return skills;
}

function extractSkillName(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\nname:\s*(\S+)/m);
  if (!match) {
    console.error(chalk.red(`Error: no "name" field in frontmatter of ${path.basename(filePath)}`));
    process.exit(1);
  }
  return match[1];
}

/** Resolve the orb package root (for finding skills/ directory). */
function getOrbRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(__filename), '..', '..');
}
