import { readFileSync } from 'node:fs';

type BunRuntime = {
  Transpiler: new (options: {
    loader: 'ts';
    target: 'browser';
  }) => {
    transformSync(src: string): string;
  };
};

export function normalizeHelperJs(src: string): string {
  const output = src.trim().replace(/;$/, '');
  try {
    const helper = new Function(`return (${output}\n);`)();
    if (typeof helper !== 'function') throw new Error('not a function');
  } catch {
    throw new Error('Transpiled helper must be one function expression');
  }
  return output;
}

export function stripTs(src: string): string {
  const bun = (globalThis as unknown as { Bun?: BunRuntime }).Bun;
  if (!bun) throw new Error('strip-ts.ts requires Bun.Transpiler');
  const expression = src.trim().replace(/;$/, '');
  // Bun drops an unused expression, so retain it through a temporary default export.
  const js = new bun.Transpiler({ loader: 'ts', target: 'browser' })
    .transformSync(`export default (${expression}\n);`)
    .trim();
  const prefix = 'export default ';
  if (!js.startsWith(prefix)) throw new Error('Unexpected Bun output: missing default export');
  return normalizeHelperJs(js.slice(prefix.length));
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: bun strip-ts.ts <file.ts>');
    process.exit(1);
  }
  try {
    process.stdout.write(`${stripTs(readFileSync(file, 'utf8'))}\n`);
  } catch (error) {
    console.error(`strip-ts: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
