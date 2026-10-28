import { randomUUID } from 'node:crypto';
import { type ToolErrorBody, toErrorBody } from './errors.js';

export type JobStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface JobContext {
  /** Aborted on cancel. Runners that support it can stop early. */
  signal: AbortSignal;
  setProgress(text: string): void;
}

export interface JobView {
  job_id: string;
  kind: string;
  status: JobStatus;
  progress: string;
  elapsed_seconds: number;
  result?: unknown;
  error?: ToolErrorBody;
}

interface Job {
  id: string;
  kind: string;
  status: JobStatus;
  progress: string;
  startedAt: number;
  finishedAt?: number;
  result?: unknown;
  error?: ToolErrorBody;
  controller: AbortController;
  done: Promise<void>;
  settle: () => void;
}

export interface JobStoreOptions {
  /** Finished jobs are removed after this time. Default 1 hour. */
  retentionMs?: number;
  now?: () => number;
}

/**
 * In-memory job store for long-running tool calls. Jobs live only for the
 * life of the MCP server process.
 */
export class JobStore {
  private readonly jobs = new Map<string, Job>();
  private readonly retentionMs: number;
  private readonly now: () => number;

  constructor(opts: JobStoreOptions = {}) {
    this.retentionMs = opts.retentionMs ?? 60 * 60 * 1000;
    this.now = opts.now ?? Date.now;
  }

  start(kind: string, run: (ctx: JobContext) => Promise<unknown>): string {
    this.prune();
    const id = randomUUID();
    let settle = () => {};
    const done = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const job: Job = {
      id,
      kind,
      status: 'running',
      progress: 'started',
      startedAt: this.now(),
      controller: new AbortController(),
      done,
      settle,
    };
    this.jobs.set(id, job);

    const ctx: JobContext = {
      signal: job.controller.signal,
      setProgress: (text) => {
        if (job.status === 'running') job.progress = text;
      },
    };

    // Run on the next tick so a synchronous throw is also caught.
    Promise.resolve()
      .then(() => run(ctx))
      .then(
        (result) => this.finish(job, 'done', result),
        (error) => this.finish(job, 'failed', undefined, toErrorBody(error)),
      );
    return id;
  }

  private finish(job: Job, status: JobStatus, result?: unknown, error?: ToolErrorBody): void {
    // A cancelled job keeps its state; the late result is dropped.
    if (job.status !== 'running') return;
    job.status = status;
    job.progress = status;
    job.finishedAt = this.now();
    job.result = result;
    job.error = error;
    job.settle();
  }

  has(id: string): boolean {
    return this.jobs.has(id);
  }

  get(id: string): JobView | undefined {
    const job = this.jobs.get(id);
    return job ? this.view(job) : undefined;
  }

  /** Wait until the job is finished or `ms` has passed, then return its view. */
  async wait(id: string, ms: number): Promise<JobView | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.status === 'running' && ms > 0) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        job.done,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, ms);
        }),
      ]);
      if (timer) clearTimeout(timer);
    }
    return this.view(job);
  }

  /**
   * Mark a job cancelled and abort its signal. The current orchestrators do
   * not read the signal, so the browser work runs to its end in the
   * background; its result is dropped.
   */
  cancel(id: string): JobView | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.status === 'running') {
      job.status = 'cancelled';
      job.progress = 'cancelled';
      job.finishedAt = this.now();
      job.controller.abort();
      job.settle();
    }
    return this.view(job);
  }

  runningCount(): number {
    let n = 0;
    for (const job of this.jobs.values()) if (job.status === 'running') n++;
    return n;
  }

  private view(job: Job): JobView {
    const end = job.finishedAt ?? this.now();
    return {
      job_id: job.id,
      kind: job.kind,
      status: job.status,
      progress: job.progress,
      elapsed_seconds: Math.round((end - job.startedAt) / 1000),
      ...(job.result !== undefined ? { result: job.result } : {}),
      ...(job.error ? { error: job.error } : {}),
    };
  }

  private prune(): void {
    const cutoff = this.now() - this.retentionMs;
    for (const [id, job] of this.jobs) {
      if (job.finishedAt !== undefined && job.finishedAt < cutoff) this.jobs.delete(id);
    }
  }
}
