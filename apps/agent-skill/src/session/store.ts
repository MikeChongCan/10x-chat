import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSessionDir, getSessionsDir } from '../paths.js';
import type { ProviderName, SessionMeta, SessionResult } from '../types.js';

/** Create a new session and return its metadata. */
export async function createSession(
  provider: ProviderName,
  promptPreview: string,
  model?: string,
): Promise<SessionMeta> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const meta: SessionMeta = {
    id,
    provider,
    model,
    promptPreview: promptPreview.slice(0, 200),
    createdAt: now,
    updatedAt: now,
    status: 'pending',
  };

  const dir = getSessionDir(id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

/** Update session status and optional duration. */
export async function updateSession(
  sessionId: string,
  update: Partial<Pick<SessionMeta, 'status' | 'durationMs' | 'model'>>,
): Promise<SessionMeta> {
  const dir = getSessionDir(sessionId);
  const metaPath = path.join(dir, 'meta.json');
  const raw = await readFile(metaPath, 'utf-8');
  const meta: SessionMeta = JSON.parse(raw);

  Object.assign(meta, update, { updatedAt: new Date().toISOString() });
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  return meta;
}

/** Save the prompt bundle to the session directory. */
export async function saveBundle(sessionId: string, bundle: string): Promise<string> {
  const filePath = path.join(getSessionDir(sessionId), 'bundle.md');
  await writeFile(filePath, bundle, 'utf-8');
  return filePath;
}

/** Save the assistant response to the session directory. */
export async function saveResponse(sessionId: string, response: string): Promise<string> {
  const filePath = path.join(getSessionDir(sessionId), 'response.md');
  await writeFile(filePath, response, 'utf-8');
  return filePath;
}

/** List recent sessions, sorted by creation time (newest first). */
export async function listSessions(opts: { hours?: number } = {}): Promise<SessionMeta[]> {
  const { hours = 24 } = opts;
  const sessionsDir = getSessionsDir();

  let entries: string[];
  try {
    entries = await readdir(sessionsDir);
  } catch {
    return [];
  }

  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const sessions: SessionMeta[] = [];

  for (const entry of entries) {
    try {
      const metaPath = path.join(sessionsDir, entry, 'meta.json');
      const raw = await readFile(metaPath, 'utf-8');
      const meta: SessionMeta = JSON.parse(raw);
      if (new Date(meta.createdAt).getTime() >= cutoff) {
        sessions.push(meta);
      }
    } catch {
      // Skip malformed sessions
    }
  }

  return sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Get a single session's full result (meta + file paths). */
export async function getSession(sessionId: string): Promise<SessionResult> {
  const dir = getSessionDir(sessionId);
  const metaPath = path.join(dir, 'meta.json');
  const raw = await readFile(metaPath, 'utf-8');
  const meta: SessionMeta = JSON.parse(raw);

  const bundlePath = path.join(dir, 'bundle.md');
  const responsePath = path.join(dir, 'response.md');

  let hasResponse = false;
  try {
    await readFile(responsePath);
    hasResponse = true;
  } catch {
    // No response saved yet
  }

  return {
    meta,
    bundlePath,
    responsePath: hasResponse ? responsePath : undefined,
  };
}
