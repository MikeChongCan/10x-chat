import { describe, expect, it } from 'vitest';
import { ToolError } from '../src/mcp/errors.js';
import { JobStore } from '../src/mcp/jobs.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('JobStore', () => {
  it('finishes inline when the work is fast', async () => {
    const jobs = new JobStore();
    const id = jobs.start('chat', async () => 'answer');
    const view = await jobs.wait(id, 1000);
    expect(view?.status).toBe('done');
    expect(view?.result).toBe('answer');
  });

  it('returns running when the inline wait times out, then done via a later wait', async () => {
    const jobs = new JobStore();
    const id = jobs.start('research', async () => {
      await sleep(80);
      return { report: 'r' };
    });
    const first = await jobs.wait(id, 10);
    expect(first?.status).toBe('running');
    expect(first?.result).toBeUndefined();
    const second = await jobs.wait(id, 1000);
    expect(second?.status).toBe('done');
    expect(second?.result).toEqual({ report: 'r' });
  });

  it('records a mapped error on failure', async () => {
    const jobs = new JobStore();
    const id = jobs.start('chat', async () => {
      throw new Error('Not logged in to Gemini. Run: 10x-chat login gemini');
    });
    const view = await jobs.wait(id, 1000);
    expect(view?.status).toBe('failed');
    expect(view?.error?.code).toBe('not_logged_in');
    expect(view?.error?.retry).toBe('after_login');
  });

  it('catches a synchronous throw', async () => {
    const jobs = new JobStore();
    const id = jobs.start('chat', () => {
      throw new ToolError('invalid_input', 'bad');
    });
    expect((await jobs.wait(id, 1000))?.error?.code).toBe('invalid_input');
  });

  it('cancel aborts the signal, ends a wait, and drops the late result', async () => {
    const jobs = new JobStore();
    let signal: AbortSignal | undefined;
    let release = () => {};
    const id = jobs.start('chat', async (ctx) => {
      signal = ctx.signal;
      await new Promise<void>((r) => {
        release = r;
      });
      return 'late';
    });
    const waiting = jobs.wait(id, 5000);
    await sleep(5);
    expect(jobs.cancel(id)?.status).toBe('cancelled');
    expect((await waiting)?.status).toBe('cancelled');
    expect(signal?.aborted).toBe(true);
    release();
    await sleep(5);
    const view = jobs.get(id);
    expect(view?.status).toBe('cancelled');
    expect(view?.result).toBeUndefined();
  });

  it('returns undefined for unknown jobs', async () => {
    const jobs = new JobStore();
    expect(jobs.get('nope')).toBeUndefined();
    expect(await jobs.wait('nope', 10)).toBeUndefined();
    expect(jobs.cancel('nope')).toBeUndefined();
  });

  it('tracks progress and prunes old finished jobs', async () => {
    let now = 1_000;
    const jobs = new JobStore({ retentionMs: 100, now: () => now });
    const id = jobs.start('chat', async (ctx) => {
      ctx.setProgress('half');
      await sleep(20);
      return 1;
    });
    await sleep(5);
    expect(jobs.get(id)?.progress).toBe('half');
    expect(jobs.activeCount()).toBe(1);
    await jobs.wait(id, 1000);
    now += 500;
    jobs.start('chat', async () => 2);
    expect(jobs.has(id)).toBe(false);
  });

  it('counts a cancelled job as active until its runner settles', async () => {
    const jobs = new JobStore();
    const id = jobs.start('chat', async () => {
      await sleep(30);
      return 1;
    });
    jobs.cancel(id);
    expect(jobs.get(id)?.status).toBe('cancelled');
    expect(jobs.activeCount()).toBe(1);
    await sleep(50);
    expect(jobs.activeCount()).toBe(0);
  });
});
