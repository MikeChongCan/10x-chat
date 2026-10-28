import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle } from '../src/core/bundle.js';

describe('buildBundle', () => {
  it('should create a bundle with just a prompt', async () => {
    const bundle = await buildBundle({ prompt: 'Hello world' });
    expect(bundle).not.toContain('# Prompt');
    expect(bundle).toContain('Hello world');
  });

  it('should include file paths header when files are specified but none match', async () => {
    const bundle = await buildBundle({
      prompt: 'Test prompt',
      files: ['nonexistent_pattern_xyz/**'],
    });
    expect(bundle).not.toContain('# Prompt');
    expect(bundle).toContain('Test prompt');
    expect(bundle).toContain('No files matched');
  });

  it('uses a longer fence when a file contains triple backticks', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ten-x-chat-bundle-'));
    try {
      const fileContent = 'before\n```js\nconst a = 1;\n```\nafter';
      await writeFile(path.join(dir, 'doc.md'), fileContent, 'utf8');

      const bundle = await buildBundle({
        prompt: 'Review',
        files: ['doc.md'],
        cwd: dir,
      });

      // The wrapping fence must be longer than the inner ``` so the block
      // is not terminated early, and the file content must survive intact.
      expect(bundle).toContain('````md');
      expect(bundle).toContain(fileContent);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
