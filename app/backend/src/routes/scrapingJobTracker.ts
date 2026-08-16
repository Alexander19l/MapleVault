import { randomUUID } from 'node:crypto';
import type { ScrapingProgressEvent } from './scrapingSyncService';

export type ScrapingJobState =
  | 'idle'
  | 'running'
  | 'completed'
  | 'completed_with_errors'
  | 'failed';

export interface ScrapingJobStatus {
  jobId: string | null;
  jobType: 'massive' | 'season' | null;
  state: ScrapingJobState;
  startYear: number | null;
  endYear: number | null;
  currentYear: number | null;
  currentSeason: string | null;
  completedSeasons: number;
  totalSeasons: number;
  successfulSeasons: number;
  failedSeasons: number;
  totalImported: number;
  retryCount: number;
  requestDelayMs: number;
  progressPercent: number;
  message: string;
  lastError: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

function idleStatus(): ScrapingJobStatus {
  return {
    jobId: null,
    jobType: null,
    state: 'idle',
    startYear: null,
    endYear: null,
    currentYear: null,
    currentSeason: null,
    completedSeasons: 0,
    totalSeasons: 0,
    successfulSeasons: 0,
    failedSeasons: 0,
    totalImported: 0,
    retryCount: 0,
    requestDelayMs: 0,
    progressPercent: 0,
    message: 'No hay una sincronización en curso.',
    lastError: null,
    startedAt: null,
    updatedAt: null,
    completedAt: null
  };
}

export class ScrapingJobTracker {
  private status: ScrapingJobStatus = idleStatus();

  isRunning(): boolean {
    return this.status.state === 'running';
  }

  getStatus(): ScrapingJobStatus {
    return { ...this.status };
  }

  startMassive(startYear: number, endYear: number, requestDelayMs: number): ScrapingJobStatus {
    return this.start({
      jobType: 'massive',
      startYear,
      endYear,
      totalSeasons: Math.max(0, endYear - startYear + 1) * 4,
      requestDelayMs,
      message: `Preparando sincronización desde ${startYear} hasta ${endYear}.`
    });
  }

  startSeason(year: number, season: string, requestDelayMs: number): ScrapingJobStatus {
    this.start({
      jobType: 'season',
      startYear: year,
      endYear: year,
      totalSeasons: 1,
      requestDelayMs,
      message: `Preparando ${year} ${season}.`
    });
    this.status.currentYear = year;
    this.status.currentSeason = season;
    return this.getStatus();
  }

  apply(event: ScrapingProgressEvent): void {
    if (!this.isRunning()) return;
    const now = new Date().toISOString();
    this.status.currentYear = event.year;
    this.status.currentSeason = event.season;
    this.status.updatedAt = now;

    switch (event.type) {
      case 'season_started':
        this.status.message = `Sincronizando ${event.year} ${event.season}...`;
        break;
      case 'retrying':
        this.status.retryCount += 1;
        this.status.message = `Esperando ${Math.ceil(event.delayMs / 1000)} s antes de reintentar ${event.year} ${event.season}.`;
        this.status.lastError = event.message;
        break;
      case 'season_completed':
        this.status.completedSeasons += 1;
        this.status.successfulSeasons += 1;
        this.status.totalImported += event.imported;
        this.status.lastError = null;
        this.status.message = `${event.year} ${event.season} completado: ${event.imported} series procesadas.`;
        break;
      case 'season_failed':
        this.status.completedSeasons += 1;
        this.status.failedSeasons += 1;
        this.status.lastError = event.message;
        this.status.message = `${event.year} ${event.season} no pudo completarse.`;
        break;
    }

    this.updateProgress();
  }

  complete(totalImported?: number): void {
    if (!this.isRunning()) return;
    const now = new Date().toISOString();
    if (Number.isFinite(totalImported)) {
      this.status.totalImported = Number(totalImported);
    }
    this.status.state = this.status.failedSeasons > 0 ? 'completed_with_errors' : 'completed';
    this.status.progressPercent = 100;
    this.status.completedAt = now;
    this.status.updatedAt = now;
    this.status.message = this.status.failedSeasons > 0
      ? `Sincronización terminada con ${this.status.failedSeasons} temporadas pendientes de reintento.`
      : `Sincronización completada: ${this.status.totalImported} series procesadas.`;
  }

  fail(error: unknown): void {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'Error desconocido';
    this.status.state = 'failed';
    this.status.lastError = message;
    this.status.message = `La sincronización se interrumpió: ${message}`;
    this.status.completedAt = now;
    this.status.updatedAt = now;
    this.updateProgress();
  }

  private start(input: {
    jobType: 'massive' | 'season';
    startYear: number;
    endYear: number;
    totalSeasons: number;
    requestDelayMs: number;
    message: string;
  }): ScrapingJobStatus {
    if (this.isRunning()) {
      throw new Error('Ya hay una sincronización en curso.');
    }

    const now = new Date().toISOString();
    this.status = {
      ...idleStatus(),
      jobId: randomUUID(),
      jobType: input.jobType,
      state: 'running',
      startYear: input.startYear,
      endYear: input.endYear,
      totalSeasons: input.totalSeasons,
      requestDelayMs: input.requestDelayMs,
      message: input.message,
      startedAt: now,
      updatedAt: now
    };
    return this.getStatus();
  }

  private updateProgress(): void {
    this.status.progressPercent = this.status.totalSeasons > 0
      ? Math.min(100, Math.round((this.status.completedSeasons / this.status.totalSeasons) * 100))
      : 0;
  }
}

export const sharedScrapingJobTracker = new ScrapingJobTracker();
