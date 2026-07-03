import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import type { ScrapingSource, ScrapingLog, ScrapingJobStatus } from '../types';
import { 
  Database, 
  Settings2, 
  RefreshCw, 
  Terminal, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Play
} from 'lucide-react';

export const Scraping: React.FC = () => {
  const [sources, setSources] = useState<ScrapingSource[]>([]);
  const [logs, setLogs] = useState<ScrapingLog[]>([]);
  const [jobStatus, setJobStatus] = useState<ScrapingJobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const activityRefreshInFlight = useRef(false);

  // Formulario manual
  const [syncYear, setSyncYear] = useState(new Date().getFullYear());
  const [syncSeason, setSyncSeason] = useState('spring');
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Edición de límites
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null);
  const [editLimit, setEditLimit] = useState(1000);

  useEffect(() => {
    loadScrapingData();
  }, []);

  useEffect(() => {
    let active = true;
    const refreshActivity = async () => {
      if (document.hidden || activityRefreshInFlight.current) return;
      activityRefreshInFlight.current = true;
      try {
        const [logList, status] = await Promise.all([
          api.getScrapingLogs(),
          api.getScrapingStatus()
        ]);
        if (!active) return;
        setLogs(logList);
        setJobStatus(status);
      } catch (err) {
        console.error('Error al actualizar el progreso de scraping:', err);
      } finally {
        activityRefreshInFlight.current = false;
      }
    };

    const interval = window.setInterval(
      refreshActivity,
      jobStatus?.state === 'running' ? 1000 : 4000
    );
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [jobStatus?.state]);

  const loadScrapingData = async () => {
    try {
      setLoading(true);
      const [srcList, logList, status] = await Promise.all([
        api.getScrapingSources(),
        api.getScrapingLogs(),
        api.getScrapingStatus()
      ]);
      setSources(srcList);
      setLogs(logList);
      setJobStatus(status);
    } catch (err) {
      console.error('Error al cargar datos de scraping:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSource = async (id: number, enabled: boolean, rateLimit: number) => {
    try {
      await api.updateScrapingSource(id, { enabled, rate_limit: rateLimit });
      loadScrapingData();
    } catch (err) {
      console.error('Error al actualizar fuente:', err);
    }
  };

  const handleSaveRateLimit = async (id: number) => {
    try {
      const src = sources.find(s => s.id === id);
      if (src) {
        await api.updateScrapingSource(id, { enabled: src.enabled === 1, rate_limit: editLimit });
        setEditingSourceId(null);
        loadScrapingData();
      }
    } catch (err) {
      console.error('Error al guardar límite de velocidad:', err);
    }
  };

  const handleManualSync = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSyncing(true);
      setSyncStatus('Iniciando sincronización de temporada...');
      const res = await api.syncSeason(syncYear, syncSeason);
      setSyncStatus(`¡Completado! ${res.message}`);
      if (res.job) setJobStatus(res.job);
      loadScrapingData();
    } catch (err: any) {
      console.error('Error al sincronizar temporada:', err);
      if (err.response?.data?.job) setJobStatus(err.response.data.job);
      setSyncStatus(`Error en la sincronización: ${err.response?.data?.error || err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const getLogStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-emerald-400" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-rose-400" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-amber-400 animate-pulse" />;
    }
  };

  const seasonLabel = (season: string | null) => ({
    winter: 'Invierno',
    spring: 'Primavera',
    summer: 'Verano',
    fall: 'Otoño'
  }[season || ''] || season || 'Sin iniciar');

  const jobRunning = jobStatus?.state === 'running';
  const jobStateLabel = {
    idle: 'En espera',
    running: 'En proceso',
    completed: 'Completado',
    completed_with_errors: 'Completado con errores',
    failed: 'Interrumpido'
  }[jobStatus?.state || 'idle'];

  if (loading && sources.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center space-y-2">
          <div className="h-8 w-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-400">Cargando panel de control...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">
      {/* Cabecera */}
      <div>
        <h2 className="text-2xl font-extrabold text-white flex items-center">
          <Database className="h-6 w-6 text-primary-400 mr-2" />
          Administrador de Scraping y APIs
        </h2>
        <p className="text-slate-400 text-xs mt-1">
          Configura y ejecuta las sincronizaciones con servicios externos de forma controlada y responsable.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Columna Izquierda: Configuración de Fuentes y Sincronizador */}
        <div className="lg:col-span-2 space-y-8">
          {/* Fuentes */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-slate-450 uppercase tracking-widest flex items-center">
              <Settings2 className="h-4 w-4 text-slate-500 mr-1.5" />
              Fuentes Configuradas
            </h3>

            <div className="space-y-3">
              {sources.map((src) => (
                <div key={src.id} className="p-4 bg-dark-card border border-dark-border/40 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-white">{src.name}</span>
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md ${
                        src.type === 'api' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-pink-500/10 text-pink-400'
                      }`}>
                        {src.type.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate mt-1">{src.base_url}</p>
                  </div>

                  <div className="flex items-center space-x-4 shrink-0 justify-between sm:justify-end">
                    {/* Rate Limit Input */}
                    <div className="text-xs">
                      {editingSourceId === src.id ? (
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="number"
                            value={editLimit}
                            onChange={(e) => setEditLimit(Math.max(100, parseInt(e.target.value) || 1000))}
                            className="w-16 bg-slate-800 border border-dark-border text-white text-[11px] px-2 py-1 rounded focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveRateLimit(src.id)}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold"
                          >
                            Guardar
                          </button>
                        </div>
                      ) : (
                        <div 
                          className="text-slate-400 cursor-pointer hover:text-slate-200"
                          onClick={() => {
                            setEditingSourceId(src.id);
                            setEditLimit(src.rate_limit);
                          }}
                          title="Click para editar"
                        >
                          Intervalo: <span className="font-semibold text-slate-200">{src.rate_limit}ms</span>
                        </div>
                      )}
                    </div>

                    {/* Habilitar / Deshabilitar */}
                    <button
                      onClick={() => handleToggleSource(src.id, src.enabled !== 1, src.rate_limit)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-xl border transition-colors ${
                        src.enabled === 1
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {src.enabled === 1 ? 'Activa' : 'Inactiva'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Sincronización Manual */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-slate-450 uppercase tracking-widest flex items-center">
              <RefreshCw className="h-4 w-4 text-slate-500 mr-1.5" />
              Sincronización Manual
            </h3>

            <form onSubmit={handleManualSync} className="p-5 bg-dark-card border border-dark-border/40 rounded-2xl space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Año</label>
                  <input
                    type="number"
                    value={syncYear}
                    onChange={(e) => setSyncYear(parseInt(e.target.value) || new Date().getFullYear())}
                    className="w-full bg-slate-800 border border-dark-border text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Temporada</label>
                  <select
                    value={syncSeason}
                    onChange={(e) => setSyncSeason(e.target.value)}
                    className="w-full bg-slate-800 border border-dark-border text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
                  >
                    <option value="winter">Invierno</option>
                    <option value="spring">Primavera</option>
                    <option value="summer">Verano</option>
                    <option value="fall">Otoño</option>
                  </select>
                </div>
              </div>

              {syncStatus && (
                <div className="p-3 bg-slate-900 border border-dark-border text-[11px] rounded-xl text-slate-350 italic">
                  {syncStatus}
                </div>
              )}

              <button
                type="submit"
                disabled={syncing}
                className="px-4 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/50 text-white text-xs font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center space-x-1.5"
              >
                <Play className="h-3.5 w-3.5 fill-white" />
                <span>{syncing ? 'Procesando...' : 'Iniciar Sincronización'}</span>
              </button>
            </form>
          </section>
        </div>

        {/* Columna Derecha: Progreso y Logs */}
        <div className="space-y-6">
          <section className="space-y-3" aria-live="polite">
            <h3 className="flex items-center text-sm font-bold uppercase tracking-widest text-slate-450">
              <RefreshCw className={`mr-1.5 h-4 w-4 text-slate-500 ${jobRunning ? 'animate-spin' : ''}`} />
              Progreso de sincronización
            </h3>

            <div className="rounded-lg border border-dark-border bg-dark-card p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-white">{jobStateLabel}</span>
                <span className="text-xs font-bold text-primary-400">
                  {jobStatus?.progressPercent || 0}%
                </span>
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={jobStatus?.progressPercent || 0}
              >
                <div
                  className="h-full bg-primary-500 transition-[width] duration-300"
                  style={{ width: `${jobStatus?.progressPercent || 0}%` }}
                />
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-slate-300">
                {jobStatus?.message || 'No hay una sincronización en curso.'}
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[10px]">
                <div>
                  <dt className="text-slate-500">Temporada actual</dt>
                  <dd className="mt-0.5 font-semibold text-slate-200">
                    {jobStatus?.currentYear || '—'} · {seasonLabel(jobStatus?.currentSeason || null)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Temporadas</dt>
                  <dd className="mt-0.5 font-semibold text-slate-200">
                    {jobStatus?.completedSeasons || 0}/{jobStatus?.totalSeasons || 0}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Series procesadas</dt>
                  <dd className="mt-0.5 font-semibold text-slate-200">{jobStatus?.totalImported || 0}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Reintentos</dt>
                  <dd className="mt-0.5 font-semibold text-slate-200">{jobStatus?.retryCount || 0}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Intervalo efectivo</dt>
                  <dd className="mt-0.5 font-semibold text-slate-200">
                    {jobStatus?.requestDelayMs ? `${jobStatus.requestDelayMs} ms` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Temporadas con error</dt>
                  <dd className="mt-0.5 font-semibold text-slate-200">{jobStatus?.failedSeasons || 0}</dd>
                </div>
              </dl>

              {jobStatus?.lastError && (
                <p className="mt-3 border-t border-rose-500/20 pt-3 text-[10px] text-rose-300">
                  {jobStatus.lastError}
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold text-slate-450 uppercase tracking-widest flex items-center">
              <Terminal className="h-4 w-4 text-slate-500 mr-1.5" />
              Consola de Logs
            </h3>

            <div className="bg-slate-950 border border-dark-border p-4 rounded-lg h-[400px] overflow-y-auto font-mono text-[10px] space-y-3">
              {logs.length === 0 ? (
                <p className="text-slate-600 italic">No hay logs en la base de datos.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="border-b border-dark-border/40 pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">
                        {log.created_at ? new Date(log.created_at).toLocaleTimeString() : ''}
                      </span>
                      <span className="font-bold text-primary-400">{log.source}</span>
                    </div>
                    <div className="flex items-start space-x-1.5 mt-1">
                      <span className="mt-0.5">{getLogStatusIcon(log.status)}</span>
                      <div className="flex-1">
                        <span className="text-slate-200 font-semibold">{log.action}: </span>
                        <span className="text-slate-400 break-words">{log.message}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
