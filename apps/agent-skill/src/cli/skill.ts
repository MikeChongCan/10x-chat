import { cp, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { Command } from 'commander';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getSkillSourceDir(): string {
  // Navigate from src/cli/ or dist/cli/ up to project root, then into skills/
  return path.resolve(__dirname, '..', '..', 'skills', '10x-chat');
}

function getSkillTargetDir(): string {
  return path.join(os.homedir(), '.codex', 'skills', '10x-chat');
}

export function createSkillCommand(): Command {
  const cmd = new Command('skill').description('Manage the 10x-chat agent skill');

  cmd
    .command('install')
    .description('Install SKILL.md into the agent skills directory')
    .action(async () => {
      const sourceDir = getSkillSourceDir();
      const targetDir = getSkillTargetDir();

      try {
        await mkdir(targetDir, { recursive: true });
        await cp(sourceDir, targetDir, { recursive: true, force: true });
        console.log(chalk.green(`✓ Skill installed to ${targetDir}`));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`Failed to install skill: ${message}`));
        process.exit(1);
      }
    });

  cmd
    .command('show')
    .description('Display the SKILL.md content')
    .action(async () => {
      const sourceDir = getSkillSourceDir();
      const skillPath = path.join(sourceDir, 'SKILL.md');
      try {
        const content = await readFile(skillPath, 'utf-8');
        console.log(content);
      } catch {
        console.error(chalk.red('SKILL.md not found. Is the package installed correctly?'));
        process.exit(1);
      }
    });

  return cmd;
}
