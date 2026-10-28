import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';

const DEFAULT_EXCLUDES = [
  'node_modules/**',
  'dist/**',
  'build/**',
  '.git/**',
  '.next/**',
  'coverage/**',
  '*.tgz',
  '.DS_Store',
  // Security: never bundle secrets
  '.env*',
  '*.pem',
  '*.key',
  '**/id_rsa',
  '**/id_ed25519',
  '**/.credentials/**',
  '**/secrets/**',
];

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

/**
 * Pick a code-fence length longer than the longest backtick run in the content,
 * so files that themselves contain ``` fences (markdown, docs) don't break the
 * surrounding fence. Per CommonMark, a fenced block ends only at a fence of the
 * same or greater length, so we use (longest run + 1), with a minimum of 3.
 */
function fenceFor(content: string): string {
  const runs = content.match(/`+/g);
  const longest = runs ? Math.max(...runs.map((r) => r.length)) : 0;
  return '`'.repeat(Math.max(3, longest + 1));
}

interface BundleOptions {
  prompt: string;
  files?: string[];
  cwd?: string;
}

/**
 * Assemble a markdown bundle from a prompt and file paths/globs.
 * Inspired by Oracle's bundle approach — one self-contained markdown document.
 */
export async function buildBundle(opts: BundleOptions): Promise<string> {
  const { prompt, files = [], cwd = process.cwd() } = opts;
  const parts: string[] = [];

  parts.push(prompt);
  parts.push('');

  if (files.length === 0) {
    return parts.join('\n');
  }

  // Resolve file globs
  const includes: string[] = [];
  const excludes: string[] = [...DEFAULT_EXCLUDES];

  for (const pattern of files) {
    if (pattern.startsWith('!')) {
      excludes.push(pattern.slice(1));
    } else {
      includes.push(pattern);
    }
  }

  const resolvedFiles = await fg(includes, {
    cwd,
    ignore: excludes,
    absolute: true,
    followSymbolicLinks: false,
    onlyFiles: true,
    dot: false,
  });

  if (resolvedFiles.length === 0) {
    parts.push('> No files matched the provided patterns.\n');
    return parts.join('\n');
  }

  parts.push(`# Context Files (${resolvedFiles.length})\n`);

  for (const filePath of resolvedFiles.sort()) {
    const fileStat = await stat(filePath);
    if (fileStat.size > MAX_FILE_SIZE) {
      parts.push(`## ${path.relative(cwd, filePath)} (SKIPPED — exceeds 1 MB)\n`);
      continue;
    }

    const content = await readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).slice(1) || 'txt';
    const relativePath = path.relative(cwd, filePath);

    const fence = fenceFor(content);
    parts.push(`## ${relativePath}\n`);
    parts.push(`${fence}${ext}`);
    parts.push(content);
    parts.push(`${fence}\n`);
  }

  return parts.join('\n');
}
