import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { findProjectRoot } from '../core/config.js';

interface SkillInfo {
  name: string;
  sourcePath: string;
}

const SKILL_FILES = [
  'requirement-analyst.md',
  'architect.md',
  'developer.md',
  'code-reviewer.md',
];

/**
 * CLI command: install skills to global (~) and project root (if in a project).
 */
export async function installSkillsCommand(): Promise<void> {
  const skills = loadAllSkills();

  // Global install
  installSkillsForCC(skills, os.homedir());
  installSkillsForCodex(skills, os.homedir());

  // Project install (if inside a project)
  const projectRoot = findProjectRoot();
  if (projectRoot) {
    installSkillsForCC(skills, projectRoot);
    installSkillsForCodex(skills, projectRoot);
  }

  console.log(chalk.green(`Installed ${skills.length} skill(s):`));
  console.log();
  for (const skill of skills) {
    console.log(`  ${chalk.cyan(`/${skill.name}`)}`);
  }
  console.log();
  console.log(`  ${chalk.gray('Claude Code:')} ~/.claude/skills/  (global)`);
  console.log(`  ${chalk.gray('Codex:')}       ~/.agents/skills/  (global)`);
  if (projectRoot) {
    console.log(`  ${chalk.gray('Project:')}     .claude/skills/ .agents/skills/`);
  }
}

/**
 * Install skills to the project root. Called by `orbc init`.
 */
export function installSkillsToProject(projectRoot: string): void {
  const skills = loadAllSkills();
  installSkillsForCC(skills, projectRoot);
  installSkillsForCodex(skills, projectRoot);
}

function installSkillsForCC(skills: SkillInfo[], targetRoot: string): void {
  const ccDir = path.join(targetRoot, '.claude', 'skills');
  fs.ensureDirSync(ccDir);
  for (const skill of skills) {
    fs.copyFileSync(skill.sourcePath, path.join(ccDir, `${skill.name}.md`));
  }
}

function installSkillsForCodex(skills: SkillInfo[], targetRoot: string): void {
  const codexDir = path.join(targetRoot, '.agents', 'skills');
  fs.ensureDirSync(codexDir);
  for (const skill of skills) {
    const destDir = path.join(codexDir, skill.name);
    fs.ensureDirSync(destDir);
    fs.copyFileSync(skill.sourcePath, path.join(destDir, 'SKILL.md'));
  }
}

function loadAllSkills(): SkillInfo[] {
  const orbRoot = getOrbRoot();
  const skillsDir = path.join(orbRoot, 'skills');
  if (!fs.existsSync(skillsDir)) {
    console.error(chalk.red('Error: skills directory not found in orb package.'));
    process.exit(1);
  }
  return loadSkills(skillsDir);
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

function getOrbRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(__filename), '..', '..');
}
