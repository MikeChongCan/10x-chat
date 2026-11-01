import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve('.');
const skills = join(root, 'skills');
const providers = [
  'gemini',
  'chatgpt',
  'claude',
  'grok',
  'perplexity',
  'notebooklm',
  'flow',
  'dreamina',
];
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}
const allFiles = files(skills);
const markdown = allFiles.filter((file) => file.endsWith('.md'));

describe('skill structure', () => {
  for (const folder of readdirSync(skills)) {
    it(`${folder} has matching name and a routing description`, () => {
      const text = readFileSync(join(skills, folder, 'SKILL.md'), 'utf8');
      const header = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
      expect(header).toBeDefined();
      expect(header?.match(/^name: (.+)$/m)?.[1]).toBe(folder);
      expect(header?.match(/^description: (.+)$/m)?.[1].length).toBeGreaterThan(20);
      expect(text.trimEnd().split('\n').length).toBeLessThanOrEqual(
        folder === '10x-chat' ? 90 : 200,
      );
    });
  }
  for (const provider of providers) {
    it(`${provider} has required helpers and fixtures`, () => {
      // All providers include send. NotebookLM alone has no model menu.
      const required = [
        'state',
        'insert',
        'send',
        'read',
        ...(provider === 'notebooklm' ? [] : ['open-models', 'models', 'pick-model']),
      ];
      for (const file of required)
        expect(existsSync(join(skills, `10x-chat-${provider}/js/${file}.js`))).toBe(true);
      expect(
        files(join(root, 'tests/fixtures', provider)).some((file) => file.endsWith('.html')),
      ).toBe(true);
    });
  }
  for (const file of allFiles.filter((file) => file.endsWith('.js'))) {
    it(`${file} is one function expression`, () => {
      const src = readFileSync(file, 'utf8');
      const ast = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      expect(ast.statements).toHaveLength(1);
      const statement = ast.statements[0];
      expect(ts.isExpressionStatement(statement)).toBe(true);
      if (!ts.isExpressionStatement(statement)) return;
      let expr = statement.expression;
      while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
      expect(ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)).toBe(true);
      expect(typeof new Function(`return ${src}`)()).toBe('function');
    });
  }
  for (const file of markdown) {
    it(`${file} has valid relative links and helper paths`, () => {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (!target || /^[a-z]+:\/\//i.test(target)) continue;
        expect(existsSync(resolve(dirname(file), target)), `${file}: ${target}`).toBe(true);
      }
      for (const match of text.matchAll(
        /((?:\.\.\/[^\s`"<>]+\/)?(?:js|bin)\/[\w.*-]+\.(?:js|sh))/g,
      )) {
        const path = match[1];
        const direct = resolve(dirname(file), path);
        if (existsSync(direct)) continue;
        // Router references use the explicit PROVIDER/ROUTER base contract.
        const router = join(skills, '10x-chat', path);
        const candidates = path.startsWith('js/')
          ? providers
              .filter((provider) => provider !== 'notebooklm' || !/models|model\.js/.test(path))
              .map((provider) => join(skills, `10x-chat-${provider}`, path))
          : [router];
        if (path.includes('*')) {
          expect(
            allFiles.some(
              (candidate) =>
                candidate.startsWith(join(skills, '10x-chat/bin/')) && candidate.endsWith('.sh'),
            ),
          ).toBe(true);
        } else expect(candidates.every(existsSync), `${file}: ${path}`).toBe(true);
      }
    });
  }
});
