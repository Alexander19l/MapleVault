export type SyncJobStatus =
  | 'idle'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface SyncJobSnapshot {
  id: string | null;
  status: SyncJobStatus;
  total: number;
  processed: number;
  updated: number;
  errors: number;
  currentTitle: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface SyncJobControl {
  isCancellationRequested(): boolean;
  beginItem(title: string): void;
  recordItem(title: string, result: 'updated' | 'skipped' | 'error'): void;
}

export interface SyncJobStartResult {
  started: boolean;
  snapshot: SyncJobSnapshot;
}

const IDLE_SNAPSHOT: SyncJobSnapshot = {
  id: null,
  status: 'idle',
  total: 0,
  processed: 0,
  updated: 0,
  errors: 0,
  currentTitle: null,
  startedAt: null,
  finishedAt: null,
  errorMessage: null
};

export class SyncJobManager {
  private snapshot: SyncJobSnapshot = { ...IDLE_SNAPSHOT };
  private cancelRequested = false;
  private sequence = 0;

  getSnapshot(): SyncJobSnapshot {
    return { ...this.snapshot };
  }

  start(total: number, runner: (control: SyncJobControl) => Promise<void>): SyncJobStartResult {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'cancelling') {
      return { started: false, snapshot: this.getSnapshot() };
    }

    const jobId = `sync-${Date.now()}-${++this.sequence}`;
    this.cancelRequested = false;
    this.snapshot = {
      id: jobId,
      status: 'running',
      total: Math.max(0, Math.trunc(total)),
      processed: 0,
      updated: 0,
      errors: 0,
      currentTitle: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      errorMessage: null
    };

    const control: SyncJobControl = {
      isCancellationRequested: () => this.cancelRequested,
      beginItem: title => {
        if (this.snapshot.id !== jobId) return;
        this.snapshot.currentTitle = title;
      },
      recordItem: (title, result) => {
        if (this.snapshot.id !== jobId) return;
        this.snapshot.currentTitle = title;
        this.snapshot.processed += 1;
        if (result === 'updated') this.snapshot.updated += 1;
        if (result === 'error') this.snapshot.errors += 1;
      }
    };

    void Promise.resolve()
      .then(() => runner(control))
      .then(() => {
        if (this.snapshot.id !== jobId) return;
        this.snapshot.status = this.cancelRequested ? 'cancelled' : 'completed';
        this.snapshot.currentTitle = null;
        this.snapshot.finishedAt = new Date().toISOString();
      })
      .catch((error: unknown) => {
        if (this.snapshot.id !== jobId) return;
        this.snapshot.status = 'failed';
        this.snapshot.currentTitle = null;
        this.snapshot.finishedAt = new Date().toISOString();
        this.snapshot.errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      });

    return { started: true, snapshot: this.getSnapshot() };
  }

  requestCancellation(): { accepted: boolean; snapshot: SyncJobSnapshot } {
    if (this.snapshot.status !== 'running' && this.snapshot.status !== 'cancelling') {
      return { accepted: false, snapshot: this.getSnapshot() };
    }

    this.cancelRequested = true;
    this.snapshot.status = 'cancelling';
    return { accepted: true, snapshot: this.getSnapshot() };
  }
}

export const syncJobManager = new SyncJobManager();
