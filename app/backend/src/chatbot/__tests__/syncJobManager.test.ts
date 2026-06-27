import { describe, expect, it } from 'vitest';
import { SyncJobManager } from '../syncJobManager';

async function waitForStatus(
  manager: SyncJobManager,
  expected: string
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (manager.getSnapshot().status === expected) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`El trabajo no alcanzo el estado ${expected}`);
}

describe('chatbot/syncJobManager', () => {
  it('registra progreso y completa un trabajo', async () => {
    const manager = new SyncJobManager();
    const launch = manager.start(2, async control => {
      control.recordItem('Naruto', 'updated');
      control.recordItem('Bleach', 'skipped');
    });

    expect(launch.started).toBe(true);
    await waitForStatus(manager, 'completed');
    expect(manager.getSnapshot()).toMatchObject({
      status: 'completed',
      total: 2,
      processed: 2,
      updated: 1,
      errors: 0
    });
  });

  it('impide dos sincronizaciones simultaneas', () => {
    const manager = new SyncJobManager();
    const neverFinishes = new Promise<void>(() => undefined);

    expect(manager.start(1, async () => neverFinishes).started).toBe(true);
    expect(manager.start(1, async () => undefined).started).toBe(false);
  });

  it('cancela de forma cooperativa entre elementos', async () => {
    const manager = new SyncJobManager();
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });

    manager.start(2, async control => {
      await gate;
      if (control.isCancellationRequested()) return;
      control.recordItem('Naruto', 'updated');
    });

    const cancellation = manager.requestCancellation();
    expect(cancellation.accepted).toBe(true);
    expect(cancellation.snapshot.status).toBe('cancelling');
    release?.();

    await waitForStatus(manager, 'cancelled');
    expect(manager.getSnapshot().processed).toBe(0);
  });

  it('conserva el error de un fallo no controlado', async () => {
    const manager = new SyncJobManager();
    manager.start(1, async () => {
      throw new Error('fallo de proveedor');
    });

    await waitForStatus(manager, 'failed');
    expect(manager.getSnapshot()).toMatchObject({
      status: 'failed',
      errorMessage: 'fallo de proveedor'
    });
  });
});
