import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import { showConfirm } from '../utils/dialog';
import type { ChatActionHistoryItem, DatabaseBackup, ScrapingJobStatus } from '../types';

import { 
  Settings as SettingsIcon, 
  Download, 
  Upload, 
  Save, 
  FolderLock, 
  Moon,
  Globe,
  Database,
  BrainCircuit,
  Zap,
  History,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock3,
  Power,
  RotateCcw,
  LoaderCircle
} from 'lucide-react';

interface SettingsProps {
  onRefreshData?: () => void;
}

interface TranslationInstallStatus {
  state: 'idle' | 'installing' | 'verifying' | 'success' | 'error' | 'unsupported';
  message?: string;
  output?: string;
}

export const Settings: React.FC<SettingsProps> = ({ onRefreshData }) => {
  const [selectedLang, setSelectedLang] = useState<'es' | 'en'>('es');
  const [closeBehavior, setCloseBehavior] = useState<'ask' | 'minimize' | 'quit'>('ask');
  const [startupEnabled, setStartupEnabled] = useState(false);
  const [startupSupported, setStartupSupported] = useState(false);
  const [startupReason, setStartupReason] = useState<string | null>(null);
  const [translationSettings, setTranslationSettings] = useState({
    enabled: true,
    autoStart: true,
    provider: 'libretranslate' as const,
    url: 'http://localhost:5001',
    apiKey: '',
    timeoutMs: 5000,
    cacheEnabled: true,
    translateSynopsis: true,
    translateGenres: true,
    translateStatuses: true
  });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [translationStatus, setTranslationStatus] = useState<any>(null);
  const [translationInstallStatus, setTranslationInstallStatus] = useState<TranslationInstallStatus>({
    state: 'idle'
  });

  // Estados de backup e importación
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [databaseBackups, setDatabaseBackups] = useState<DatabaseBackup[]>([]);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [backupListError, setBackupListError] = useState<string | null>(null);
  const [backupCreating, setBackupCreating] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);
  const backupStatusTimerRef = useRef<number | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Estados de scraping masivo
  const [scrapingYear, setScrapingYear] = useState<number>(new Date().getFullYear() - 1);
  const [scrapingStatus, setScrapingStatus] = useState<string | null>(null);
  const [scrapingLoading, setScrapingLoading] = useState(false);
  const [scrapingJob, setScrapingJob] = useState<ScrapingJobStatus | null>(null);

  useEffect(() => {
    let active = true;
    let refreshInFlight = false;

    const refreshScrapingStatus = async () => {
      if (document.hidden || refreshInFlight) return;
      refreshInFlight = true;
      try {
        const status = await api.getScrapingStatus();
        if (active) setScrapingJob(status);
      } catch (error) {
        console.error('Error al consultar el progreso del scraping:', error);
      } finally {
        refreshInFlight = false;
      }
    };

    void refreshScrapingStatus();
    const interval = window.setInterval(
      refreshScrapingStatus,
      scrapingJob?.state === 'running' ? 1000 : 5000
    );
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [scrapingJob?.state]);

  // Borrado de Catálogo
  const [keepUserList, setKeepUserList] = useState(true);

  // AI Settings
  const [aiSettings, setAiSettings] = useState<any>({
    provider: 'ollama',
    model: 'llama3.2',
    url: 'http://localhost:11434',
    temperature: 0.3,
    contextLimit: 4096,
    maxTokens: 500,
    enabled: false
  });
  const [testAiStatus, setTestAiStatus] = useState<string | null>(null);
  const [actionHistory, setActionHistory] = useState<ChatActionHistoryItem[]>([]);
  const [actionHistoryLoading, setActionHistoryLoading] = useState(false);
  const [actionHistoryError, setActionHistoryError] = useState<string | null>(null);
  const [actionHistoryStatusFilter, setActionHistoryStatusFilter] = useState<'all' | 'SUCCESS' | 'REJECTED' | 'ERROR'>('all');
  const [actionHistoryConfirmationFilter, setActionHistoryConfirmationFilter] = useState<'all' | 'required' | 'not_required'>('all');

  const loadTranslationStatus = useCallback(async () => {
    try {
      const status = await api.getTranslationStatus();
      setTranslationStatus(status);
    } catch (_) {
      setTranslationStatus(null);
    }
  }, []);

  const loadTranslationInstallStatus = useCallback(async () => {
    try {
      const status = await api.getTranslationInstallStatus();
      setTranslationInstallStatus(status);
      if (status.state === 'success') {
        await loadTranslationStatus();
      }
    } catch (_) {
      setTranslationInstallStatus({
        state: 'error',
        message: 'No se pudo consultar el estado de instalación.'
      });
    }
  }, [loadTranslationStatus]);

  useEffect(() => {
    loadSettings();
    loadActionHistory();
    loadTranslationStatus();
    loadTranslationInstallStatus();
    loadStartupSettings();
    loadDatabaseBackups();

    return () => {
      if (backupStatusTimerRef.current !== null) {
        window.clearTimeout(backupStatusTimerRef.current);
      }
    };
  }, [loadTranslationInstallStatus, loadTranslationStatus]);

  useEffect(() => {
    const isInstalling = ['installing', 'verifying'].includes(translationInstallStatus.state);
    if (!isInstalling) return;

    const intervalId = window.setInterval(() => {
      void loadTranslationInstallStatus();
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [loadTranslationInstallStatus, translationInstallStatus.state]);

  const handleClearCatalog = async () => {
    try {
      setSaving(true);
      const res = await api.clearCatalog(keepUserList);
      alert(res.message);
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      console.error('Error al vaciar catálogo:', err);
      alert('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleClearBotMemory = async () => {
    try {
      setSaving(true);
      const res = await api.clearBotMemory();
      alert(res.message || 'Memoria borrada');
    } catch (err: any) {
      console.error('Error al vaciar memoria bot:', err);
      alert('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSelectedLang('es');
      const storedCloseBehavior = data.closeBehavior || 'ask';
      setCloseBehavior(storedCloseBehavior);
      await (window as any).electronAPI?.closeBehavior?.set?.(storedCloseBehavior);
      if (data.translation) {
        setTranslationSettings({
          enabled: data.translation.enabled ?? true,
          autoStart: data.translation.autoStart ?? true,
          provider: 'libretranslate',
          url: data.translation.url || 'http://localhost:5001',
          apiKey: data.translation.apiKey || '',
          timeoutMs: data.translation.timeoutMs || 5000,
          cacheEnabled: data.translation.cacheEnabled ?? true,
          translateSynopsis: data.translation.translateSynopsis ?? true,
          translateGenres: data.translation.translateGenres ?? true,
          translateStatuses: data.translation.translateStatuses ?? true
        });
      }
      
      const aiData = await api.getAISettings();
      if (aiData) setAiSettings(aiData);
    } catch (err) {
      console.error('Error al cargar ajustes:', err);
    }
  };

  const loadStartupSettings = async () => {
    const startupApi = (window as any).electronAPI?.startup;
    if (!startupApi?.get) {
      setStartupSupported(false);
      setStartupReason('Disponible en la aplicación de escritorio instalada.');
      return;
    }

    try {
      const result = await startupApi.get();
      setStartupSupported(Boolean(result.supported));
      setStartupEnabled(Boolean(result.enabled));
      setStartupReason(result.reason || null);
    } catch (err: any) {
      setStartupSupported(false);
      setStartupReason(err.message || 'No se pudo consultar el inicio automático.');
    }
  };

  const loadActionHistory = async () => {
    try {
      setActionHistoryLoading(true);
      setActionHistoryError(null);
      const history = await api.getChatActionHistory();
      setActionHistory(Array.isArray(history) ? history : []);
    } catch (err: any) {
      console.error('Error al cargar historial de acciones:', err);
      setActionHistoryError(err.response?.data?.error || err.message || 'No se pudo cargar el historial.');
    } finally {
      setActionHistoryLoading(false);
    }
  };

  const formatActionDate = (value?: string) => {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleInstallLibreTranslate = async () => {
    const confirmed = await showConfirm(
      'LibreTranslate es un componente opcional y pesado. Se descargaran Python si hace falta, el servicio local y el modelo ingles-espanol. El proceso puede tardar varios minutos. ¿Deseas continuar?'
    );
    if (!confirmed) return;

    try {
      const status = await api.installLibreTranslate();
      setTranslationInstallStatus(status);
    } catch (err: any) {
      setTranslationInstallStatus({
        state: 'error',
        message: err.response?.data?.message || err.message || 'No se pudo iniciar la instalacion.'
      });
    }
  };

  const formatBackupDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
    return date.toLocaleString('es-419', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatBackupSize = (sizeBytes: number) => {
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 KB';
    if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const scheduleBackupStatusClear = (delayMs: number) => {
    if (backupStatusTimerRef.current !== null) {
      window.clearTimeout(backupStatusTimerRef.current);
    }
    backupStatusTimerRef.current = window.setTimeout(() => {
      setBackupStatus(null);
      backupStatusTimerRef.current = null;
    }, delayMs);
  };

  const getHistoryStatusMeta = (status: string) => {
    if (status === 'SUCCESS') {
      return {
        label: 'Correcto',
        className: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300',
        icon: CheckCircle2
      };
    }

    if (status === 'REJECTED') {
      return {
        label: 'Rechazado',
        className: 'bg-amber-500/10 border-amber-500/25 text-amber-300',
        icon: AlertTriangle
      };
    }

    if (status === 'ERROR') {
      return {
        label: 'Error',
        className: 'bg-rose-500/10 border-rose-500/25 text-rose-300',
        icon: XCircle
      };
    }

    return {
      label: status || 'Desconocido',
      className: 'bg-slate-800 border-slate-700 text-slate-300',
      icon: Clock3
    };
  };

  const countActionHistoryByStatus = (status: 'SUCCESS' | 'REJECTED' | 'ERROR') => (
    actionHistory.filter(item => item.execution_status === status).length
  );

  const countActionHistoryByConfirmation = (required: boolean) => (
    actionHistory.filter(item => Number(item.requires_confirmation) === (required ? 1 : 0)).length
  );

  const filteredActionHistory = actionHistory.filter(item => {
    const statusMatches = actionHistoryStatusFilter === 'all' || item.execution_status === actionHistoryStatusFilter;
    const confirmationMatches =
      actionHistoryConfirmationFilter === 'all'
      || (actionHistoryConfirmationFilter === 'required' && Number(item.requires_confirmation) === 1)
      || (actionHistoryConfirmationFilter === 'not_required' && Number(item.requires_confirmation) !== 1);

    return statusMatches && confirmationMatches;
  });

  const statusFilterOptions = [
    { id: 'all' as const, label: 'Todos', count: actionHistory.length },
    { id: 'SUCCESS' as const, label: 'Correctos', count: countActionHistoryByStatus('SUCCESS') },
    { id: 'REJECTED' as const, label: 'Rechazados', count: countActionHistoryByStatus('REJECTED') },
    { id: 'ERROR' as const, label: 'Errores', count: countActionHistoryByStatus('ERROR') }
  ];

  const confirmationFilterOptions = [
    { id: 'all' as const, label: 'Todas', count: actionHistory.length },
    { id: 'required' as const, label: 'Con confirmación', count: countActionHistoryByConfirmation(true) },
    { id: 'not_required' as const, label: 'Sin confirmación', count: countActionHistoryByConfirmation(false) }
  ];

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSaveStatus('Guardando ajustes...');
      await api.saveSettings({
        theme: 'dark',
        language: 'es',
        closeBehavior,
        translation: translationSettings
      });
      await (window as any).electronAPI?.closeBehavior?.set?.(closeBehavior);
      await api.setAISettings(aiSettings);

      const startupApi = (window as any).electronAPI?.startup;
      if (startupSupported && startupApi?.set) {
        const result = await startupApi.set(startupEnabled);
        setStartupEnabled(Boolean(result.enabled));
        setStartupReason(result.reason || null);
      }
      
      setSaveStatus('Ajustes guardados con éxito.');
      if (onRefreshData) onRefreshData();
      
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.style.colorScheme = 'dark';
    } catch (err) {
      console.error('Error al guardar ajustes:', err);
      setSaveStatus('Error al guardar los ajustes.');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleExportData = async () => {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maplevault-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al exportar catálogo:', err);
      alert('Error al exportar los datos.');
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setImportStatus('Procesando archivo...');
        const json = JSON.parse(event.target?.result as string);
        const res = await api.importData(json);
        setImportStatus(`Importación completada con éxito. ${res.message}`);
        if (onRefreshData) onRefreshData();
      } catch (err: any) {
        console.error('Error al importar:', err);
        setImportStatus(`Fallo en la importación: ${err.message}`);
      } finally {
        setTimeout(() => setImportStatus(null), 5000);
      }
    };
    reader.readAsText(file);
  };

  const handleCreateBackup = async () => {
    try {
      setBackupCreating(true);
      setBackupStatus('Creando copia de seguridad...');
      const res = await api.createBackup();
      await loadDatabaseBackups();
      setBackupStatus(`Copia de seguridad creada correctamente: ${res.filename}`);
    } catch (err: any) {
      console.error('Error al crear backup:', err);
      setBackupStatus(`Error al crear copia de seguridad: ${err.response?.data?.error || err.message}`);
    } finally {
      setBackupCreating(false);
      scheduleBackupStatusClear(8000);
    }
  };

  const handleCloseBehaviorChange = (value: 'ask' | 'minimize' | 'quit') => {
    setCloseBehavior(value);
    void (window as any).electronAPI?.closeBehavior?.set?.(value);
    void api.saveCloseBehavior(value).catch((error: any) => {
      console.error('No se pudo guardar el comportamiento de cierre:', error);
      setSaveStatus('No se pudo guardar el comportamiento de cierre.');
    });
  };

  const loadDatabaseBackups = async () => {
    try {
      setBackupListLoading(true);
      setBackupListError(null);
      const backups = await api.listDatabaseBackups();
      setDatabaseBackups(Array.isArray(backups) ? backups : []);
    } catch (err: any) {
      console.error('Error al cargar copias de seguridad:', err);
      setBackupListError(err.response?.data?.error || err.message || 'No se pudieron cargar las copias de seguridad.');
    } finally {
      setBackupListLoading(false);
    }
  };

  const handleRestoreBackup = async (backup: DatabaseBackup) => {
    const confirmed = await showConfirm(
      `¿Restaurar la copia "${backup.name}"? MapleVault reemplazará los datos actuales y creará primero una copia de emergencia.`
    );
    if (!confirmed) return;

    try {
      setRestoringBackup(backup.name);
      setBackupStatus(`Restaurando ${backup.name}...`);
      const result = await api.restoreDatabaseBackup(backup.path);
      await loadDatabaseBackups();
      setBackupStatus(result.message || 'La copia se restauró correctamente.');
      onRefreshData?.();
      window.dispatchEvent(new CustomEvent('maplevault:database-restored'));
    } catch (err: any) {
      console.error('Error al restaurar copia de seguridad:', err);
      setBackupStatus(`No se pudo restaurar la copia: ${err.response?.data?.error || err.message}`);
    } finally {
      setRestoringBackup(null);
      scheduleBackupStatusClear(10000);
    }
  };

  const handleStartMassiveScraping = async () => {
    try {
      setScrapingLoading(true);
      setScrapingStatus('Iniciando scraping masivo...');
      const res = await api.syncYears(scrapingYear);
      setScrapingStatus(res.message);
      if (res.job) setScrapingJob(res.job);
    } catch (err: any) {
      console.error('Error al iniciar scraping masivo:', err);
      if (err.response?.data?.job) setScrapingJob(err.response.data.job);
      setScrapingStatus('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setScrapingLoading(false);
    }
  };

  const handleTestAiConnection = async () => {
    try {
      setTestAiStatus('Conectando...');
      const res = await api.testAIConnection({ url: aiSettings.url, provider: aiSettings.provider, model: aiSettings.model });
      setTestAiStatus(res.message);
      setTimeout(() => setTestAiStatus(null), 5000);
    } catch (err: any) {
      setTestAiStatus(err.response?.data?.message || err.message);
      setTimeout(() => setTestAiStatus(null), 15000); // 15 secs so they can read instructions
    }
  };

  const handleResetAiSettings = async () => {
    if (await showConfirm("¿Restablecer configuración de IA a valores por defecto?")) {
      try {
        await api.resetAISettings();
        const aiData = await api.getAISettings();
        setAiSettings(aiData);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSeedMemory = async () => {
    try {
      setTestAiStatus('Generando memoria inicial...');
      const res = await api.seedAIMemory();
      setTestAiStatus(res.message);
      setTimeout(() => setTestAiStatus(null), 5000);
    } catch (err: any) {
      setTestAiStatus(err.response?.data?.message || err.message);
      setTimeout(() => setTestAiStatus(null), 15000);
    }
  };

  const handleGenerateMemoryProfile = async () => {
    try {
      setTestAiStatus('Analizando biblioteca y recalculando perfil de gustos...');
      const res = await api.generateBotMemoryProfile();
      const profile = res.profile;
      const topGenres = Array.isArray(profile?.inferredGenres)
        ? profile.inferredGenres.slice(0, 5).map((item: any) => item.genre).join(', ')
        : '';
      setTestAiStatus(topGenres ? `${res.message}\nGéneros principales: ${topGenres}` : res.message);
      setTimeout(() => setTestAiStatus(null), 8000);
    } catch (err: any) {
      setTestAiStatus(err.response?.data?.message || err.message);
      setTimeout(() => setTestAiStatus(null), 15000);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">
      {/* Cabecera */}
      <div>
        <h2 className="text-2xl font-extrabold text-white flex items-center">
          <SettingsIcon className="h-6 w-6 text-primary-400 mr-2" />
          Ajustes de la Aplicación
        </h2>
        <p className="text-slate-400 text-xs mt-1">
          Configura tus preferencias del sistema y la gestión de archivos locales.
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-8">
        {/* Sección 2: Apariencia e Idioma */}
        <section className="p-6 bg-dark-card border border-dark-border/40 rounded-3xl space-y-4">
          <h3 className="text-sm font-bold text-slate-350 uppercase tracking-widest flex items-center">
            <Globe className="h-4.5 w-4.5 text-secondary-400 mr-2" />
            Apariencia y Sistema
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
            <div className="space-y-2">
              <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">Tema Visual</span>
              <div className="flex min-h-11 items-center gap-3 border border-dark-border/50 bg-slate-900/60 px-3 text-slate-200">
                <Moon className="h-4 w-4 text-primary-400" />
                <div>
                  <span className="block font-semibold">Tema oscuro</span>
                  <span className="block text-[9px] text-slate-500">Diseño único de MapleVault</span>
                </div>
              </div>
            </div>

            {/* Idioma */}
            <div className="space-y-2">
              <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">Idioma de la Interfaz</span>
              <select
                value={selectedLang}
                onChange={() => setSelectedLang('es')}
                disabled
                className="w-full bg-slate-800 border border-dark-border text-white text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:border-primary-500"
              >
                <option value="es">Español latino</option>
              </select>
              <p className="text-[10px] leading-relaxed text-slate-500">
                La interfaz está normalizada en español latino. Otros idiomas requieren una capa i18n completa.
              </p>
            </div>
          </div>
        </section>

        <section className="p-6 bg-dark-card border border-dark-border/40 rounded-3xl space-y-4">
          <h3 className="text-sm font-bold text-slate-350 uppercase tracking-widest flex items-center">
            Comportamiento de Ventana
          </h3>
          <div className="grid grid-cols-1 gap-5 text-xs md:grid-cols-2">
            <div className="space-y-2">
              <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">Al cerrar MapleVault</span>
              <select
                value={closeBehavior}
                onChange={(event) => {
                  const value = event.target.value as 'ask' | 'minimize' | 'quit';
                  handleCloseBehaviorChange(value);
                }}
                className="w-full bg-slate-800 border border-dark-border text-white text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:border-primary-500"
              >
                <option value="ask">Preguntar siempre</option>
                <option value="minimize">Minimizar en segundo plano</option>
                <option value="quit">Cerrar por completo</option>
              </select>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                En segundo plano, MapleVault permanece en la bandeja y conserva activos sus servicios locales.
              </p>
            </div>

            <div className="space-y-2">
              <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">Inicio del sistema</span>
              <label className={`flex min-h-11 items-center gap-3 border border-dark-border bg-slate-900/40 px-3 ${
                startupSupported ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
              }`}>
                <input
                  type="checkbox"
                  checked={startupEnabled}
                  disabled={!startupSupported}
                  onChange={event => setStartupEnabled(event.target.checked)}
                  className="h-4 w-4 accent-violet-500"
                />
                <Power className="h-4 w-4 text-violet-400" />
                <span className="font-bold text-slate-200">Abrir MapleVault al iniciar Windows</span>
              </label>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                {startupReason || 'MapleVault se abrirá automáticamente después de iniciar sesión en Windows.'}
              </p>
            </div>
          </div>
        </section>

        <section className="p-6 bg-dark-card border border-dark-border/40 rounded-3xl space-y-4">
          <h3 className="text-sm font-bold text-slate-350 uppercase tracking-widest flex items-center">
            <Globe className="h-4.5 w-4.5 text-cyan-400 mr-2" />
            Traducción de Metadata
          </h3>
          <p className="text-slate-400 text-xs">
            MapleVault usa LibreTranslate para mostrar sinopsis y datos auxiliares en español sin sobrescribir la metadata original.
          </p>

          <div className="space-y-4 bg-slate-900/40 p-4 border border-dark-border/60 rounded-2xl">
            <label className="flex items-center gap-3 text-xs font-bold text-cyan-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={translationSettings.enabled}
                onChange={(e) => setTranslationSettings({ ...translationSettings, enabled: e.target.checked })}
                className="h-4 w-4 accent-cyan-500 cursor-pointer"
              />
              Activar traducción con LibreTranslate
            </label>

            <label className="flex items-center gap-3 text-xs font-bold text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={translationSettings.autoStart}
                onChange={(e) => setTranslationSettings({ ...translationSettings, autoStart: e.target.checked })}
                className="h-4 w-4 accent-cyan-500 cursor-pointer"
              />
              Iniciar LibreTranslate automáticamente junto con MapleVault
            </label>

            <div className="flex flex-col gap-3 border border-cyan-500/20 bg-cyan-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-200">Componente local opcional</p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                  Instala LibreTranslate y el modelo inglés-español en tu perfil de Windows. No forma parte del instalador base por su tamaño.
                </p>
              </div>
              <button
                type="button"
                onClick={handleInstallLibreTranslate}
                disabled={translationInstallStatus.state === 'installing' || translationInstallStatus.state === 'verifying'}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 border border-cyan-500/40 bg-cyan-500/10 px-3 text-[10px] font-bold text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-60"
              >
                {translationInstallStatus.state === 'installing' || translationInstallStatus.state === 'verifying' ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {translationInstallStatus.state === 'installing'
                  ? 'Instalando...'
                  : translationInstallStatus.state === 'verifying'
                    ? 'Verificando...'
                    : 'Instalar LibreTranslate'}
              </button>
            </div>

            {translationInstallStatus.state !== 'idle' && (
              <div className={`border px-3 py-2 text-[10px] ${
                translationInstallStatus.state === 'success'
                  ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200'
                  : translationInstallStatus.state === 'error' || translationInstallStatus.state === 'unsupported'
                    ? 'border-rose-500/25 bg-rose-500/5 text-rose-200'
                    : 'border-amber-500/25 bg-amber-500/5 text-amber-100'
              }`}>
                <p className="font-bold">{translationInstallStatus.message || 'Procesando instalación...'}</p>
                {translationInstallStatus.output && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-bold text-slate-300">Ver diagnóstico</summary>
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words bg-slate-950/60 p-2 font-mono text-[9px] text-slate-400">
                      {translationInstallStatus.output}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {translationStatus && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[10px] text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Estado: <strong className="text-cyan-300">{translationStatus.state}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={loadTranslationStatus}
                    className="text-cyan-300 hover:text-cyan-200 font-bold"
                  >
                    Actualizar estado
                  </button>
                </div>
                {translationStatus.command && (
                  <p className="mt-1 text-slate-500">Comando: {translationStatus.command}</p>
                )}
                {translationStatus.lastError && (
                  <p className="mt-1 text-amber-300">{translationStatus.lastError}</p>
                )}
                {Array.isArray(translationStatus.attempts) && translationStatus.attempts.length > 0 && (
                  <ul className="mt-2 space-y-1 text-slate-500">
                    {translationStatus.attempts.slice(0, 4).map((attempt: string) => (
                      <li key={attempt}>- {attempt}</li>
                    ))}
                  </ul>
                )}
                {translationStatus.installHint && (
                  <p className="mt-2 text-cyan-300">{translationStatus.installHint}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">URL de LibreTranslate</label>
                <input
                  type="url"
                  value={translationSettings.url}
                  onChange={(e) => setTranslationSettings({ ...translationSettings, url: e.target.value })}
                  placeholder="http://localhost:5001"
                  className="w-full bg-slate-800 border border-dark-border text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">API Key opcional</label>
                <input
                  type="password"
                  value={translationSettings.apiKey}
                  onChange={(e) => setTranslationSettings({ ...translationSettings, apiKey: e.target.value })}
                  placeholder="Solo si tu instancia la requiere"
                  className="w-full bg-slate-800 border border-dark-border text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Timeout: {translationSettings.timeoutMs} ms
                </label>
                <input
                  type="range"
                  min="3000"
                  max="15000"
                  step="100"
                  value={translationSettings.timeoutMs}
                  onChange={(e) => setTranslationSettings({ ...translationSettings, timeoutMs: Number(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-dark-border/40">
              {[
                ['cacheEnabled', 'Usar cache SQLite'],
                ['translateSynopsis', 'Traducir sinopsis'],
                ['translateGenres', 'Traducir géneros'],
                ['translateStatuses', 'Traducir estados']
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-xl border border-dark-border/60 bg-slate-950/25 px-3 py-2 text-[10px] font-bold text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean((translationSettings as any)[key])}
                    onChange={(e) => setTranslationSettings({ ...translationSettings, [key]: e.target.checked })}
                    className="h-3.5 w-3.5 accent-cyan-500 cursor-pointer"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Sección de Guardar Ajustes */}
        <div className="flex items-center space-x-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 border-2 border-black text-white text-xs font-black rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:-translate-x-0.5 active:translate-y-0 active:translate-x-0 active:shadow-none flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Guardando...' : 'Guardar Ajustes'}</span>
          </button>
          {saveStatus && (
            <span className="text-xs text-primary-400 font-semibold italic animate-pulse-soft">
              {saveStatus}
            </span>
          )}
        </div>
      </form>

      {/* Sección: Scraping Masivo */}
      <section className="p-6 bg-dark-card border border-dark-border/40 rounded-3xl space-y-4">
        <h3 className="text-sm font-bold text-slate-350 uppercase tracking-widest flex items-center">
          <Database className="h-4.5 w-4.5 text-secondary-500 mr-2" />
          Scraping Masivo de Catálogo
        </h3>
        <p className="text-slate-400 text-xs">
          Importa automáticamente todos los animes de múltiples temporadas a la vez desde el año que elijas hasta el año actual. Esto agregará inmediatamente las series al catálogo local en segundo plano. Puedes monitorear el avance desde los logs de scraping.
        </p>
        
        <div className="flex flex-col sm:flex-row items-end gap-4 bg-slate-900/40 p-4 border border-dark-border/60 rounded-2xl">
          <div className="flex-1 space-y-2">
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Año de Inicio
            </label>
            <input
              type="number"
              min="1970"
              max={new Date().getFullYear()}
              value={scrapingYear}
              onChange={(e) => setScrapingYear(parseInt(e.target.value) || new Date().getFullYear())}
              className="w-full bg-slate-800 border border-dark-border text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-primary-500"
            />
          </div>
          <button
            type="button"
            onClick={handleStartMassiveScraping}
            disabled={scrapingLoading || scrapingJob?.state === 'running'}
            className="w-full sm:w-auto px-6 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-850 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1.5"
          >
            {(scrapingLoading || scrapingJob?.state === 'running') && <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
            <span>
              {scrapingLoading
                ? 'Iniciando...'
                : scrapingJob?.state === 'running'
                  ? `Sincronizando ${scrapingJob.progressPercent}%`
                  : 'Iniciar Scraping Masivo'}
            </span>
          </button>
        </div>

        {(scrapingStatus || scrapingJob?.state === 'running') && (
          <p className="text-[10px] text-primary-400 italic font-semibold pt-1">
            {scrapingJob?.state === 'running' ? scrapingJob.message : scrapingStatus}
          </p>
        )}

        {scrapingJob && scrapingJob.state !== 'idle' && (
          <div className="space-y-2 rounded-lg border border-dark-border/60 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-400">
                {scrapingJob.completedSeasons}/{scrapingJob.totalSeasons} temporadas
              </span>
              <span className="font-bold text-primary-400">{scrapingJob.progressPercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-primary-500 transition-[width] duration-300"
                style={{ width: `${scrapingJob.progressPercent}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
              <span>Series: {scrapingJob.totalImported}</span>
              <span>Reintentos: {scrapingJob.retryCount}</span>
              <span>Errores: {scrapingJob.failedSeasons}</span>
            </div>
          </div>
        )}
      </section>

      {/* Sección: Modelo local de IA */}
      <section className="p-6 bg-dark-card border border-dark-border/40 rounded-3xl space-y-4">
        <h3 className="text-sm font-bold text-slate-350 uppercase tracking-widest flex items-center">
          <BrainCircuit className="h-4.5 w-4.5 text-green-500 mr-2" />
          Modelo Local de IA (Ollama)
        </h3>
        <p className="text-slate-400 text-xs">
          Conecta el Asistente NLP con un LLM local (como Llama 3.2) para que procese lenguaje natural complejo de manera 100% privada y offline. Si esto falla, el asistente volverá automáticamente al motor local rápido.
        </p>

        <div className="space-y-4 bg-slate-900/40 p-4 border border-dark-border/60 rounded-2xl">
          <div className="flex items-center space-x-3 pb-2 border-b border-dark-border/40">
            <input
              type="checkbox"
              id="ai-enabled"
              checked={aiSettings.enabled}
              onChange={(e) => setAiSettings({...aiSettings, enabled: e.target.checked})}
              className="h-4 w-4 accent-green-600 cursor-pointer"
            />
            <label htmlFor="ai-enabled" className="text-xs font-bold text-green-400 cursor-pointer select-none">
              Activar Maple Assistant avanzado (Ollama / Llama 3.2)
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">Proveedor</label>
              <select
                value={aiSettings.provider}
                onChange={(e) => setAiSettings({...aiSettings, provider: e.target.value})}
                className="w-full bg-slate-800 border border-dark-border text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-green-500 opacity-70 cursor-not-allowed"
                disabled
              >
                <option value="ollama">Ollama (Exclusivo)</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">Modelo</label>
              <input
                type="text"
                value="llama3.2"
                className="w-full bg-slate-800 border border-dark-border text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-green-500 opacity-70 cursor-not-allowed"
                disabled
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">URL Local</label>
              <input
                type="text"
                value={aiSettings.url}
                onChange={(e) => setAiSettings({...aiSettings, url: e.target.value})}
                placeholder="http://localhost:11434"
                className="w-full bg-slate-800 border border-dark-border text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-green-500"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                Temperatura: {aiSettings.temperature}
              </label>
              <input
                type="range"
                min="0" max="1" step="0.1"
                value={aiSettings.temperature}
                onChange={(e) => setAiSettings({...aiSettings, temperature: parseFloat(e.target.value)})}
                className="w-full accent-green-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-dark-border/40">
            <button
              type="button"
              onClick={handleTestAiConnection}
              className="py-2 bg-slate-800 hover:bg-slate-750 border border-dark-border text-green-400 hover:text-green-300 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Zap className="h-4 w-4" />
              <span>Probar Conexión</span>
            </button>
            <button
              type="button"
              onClick={handleSeedMemory}
              className="py-2 bg-slate-800 hover:bg-slate-750 border border-dark-border text-blue-400 hover:text-blue-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Generar Memoria Inicial
            </button>
            <button
              type="button"
              onClick={handleGenerateMemoryProfile}
              className="py-2 bg-slate-800 hover:bg-slate-750 border border-dark-border text-cyan-400 hover:text-cyan-300 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
            >
              <BrainCircuit className="h-4 w-4" />
              <span>Perfil de Gustos</span>
            </button>
            <button
              type="button"
              onClick={handleResetAiSettings}
              className="py-2 bg-slate-800 hover:bg-slate-750 border border-dark-border text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Restablecer Valores
            </button>
          </div>
          {testAiStatus && (
            <div className={`mt-2 p-3 rounded-lg border text-xs whitespace-pre-wrap ${testAiStatus.includes('error') || testAiStatus.includes('no se encontró') ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-green-500/10 border-green-500/30 text-green-300'}`}>
              {testAiStatus}
            </div>
          )}
        </div>
      </section>

      {/* Sección: Auditoría de Maple Assistant */}
      <section className="p-6 bg-dark-card border border-dark-border/40 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-350 uppercase tracking-widest flex items-center">
              <History className="h-4.5 w-4.5 text-cyan-400 mr-2" />
              Historial de Acciones de Maple Assistant
            </h3>
            <p className="text-slate-400 text-xs mt-1">
              Revisa las acciones propuestas o ejecutadas por el asistente, incluyendo confirmaciones, rechazos y errores recientes.
            </p>
          </div>
          <button
            type="button"
            onClick={loadActionHistory}
            disabled={actionHistoryLoading}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-750 border border-dark-border text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${actionHistoryLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>

        {actionHistoryError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {actionHistoryError}
          </div>
        )}

        {actionHistory.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 rounded-2xl border border-dark-border/60 bg-slate-950/20 p-3">
            <div className="space-y-2">
              <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">Estado</span>
              <div className="flex flex-wrap gap-2">
                {statusFilterOptions.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setActionHistoryStatusFilter(option.id)}
                    className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-colors cursor-pointer ${
                      actionHistoryStatusFilter === option.id
                        ? 'bg-cyan-500/10 border-cyan-500/35 text-cyan-300'
                        : 'bg-slate-900/60 border-dark-border text-slate-400 hover:text-white'
                    }`}
                  >
                    {option.label} ({option.count})
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">Confirmación</span>
              <div className="flex flex-wrap gap-2">
                {confirmationFilterOptions.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setActionHistoryConfirmationFilter(option.id)}
                    className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-colors cursor-pointer ${
                      actionHistoryConfirmationFilter === option.id
                        ? 'bg-cyan-500/10 border-cyan-500/35 text-cyan-300'
                        : 'bg-slate-900/60 border-dark-border text-slate-400 hover:text-white'
                    }`}
                  >
                    {option.label} ({option.count})
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-dark-border/60 bg-slate-950/20">
          {actionHistoryLoading && actionHistory.length === 0 ? (
            <div className="p-5 text-xs text-slate-400">Cargando historial de acciones...</div>
          ) : actionHistory.length === 0 ? (
            <div className="p-5 text-xs text-slate-400">
              Todavía no hay acciones auditadas. Cuando Maple Assistant proponga o ejecute acciones, aparecerán en esta sección.
            </div>
          ) : filteredActionHistory.length === 0 ? (
            <div className="p-5 text-xs text-slate-400">
              No hay acciones que coincidan con los filtros seleccionados.
            </div>
          ) : (
            <div className="divide-y divide-dark-border/60">
              {filteredActionHistory.slice(0, 12).map((item) => {
                const statusMeta = getHistoryStatusMeta(item.execution_status);
                const StatusIcon = statusMeta.icon;
                const requiresConfirmation = Number(item.requires_confirmation) === 1;

                return (
                  <div key={item.id} className="p-4 hover:bg-slate-900/35 transition-colors">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusMeta.className}`}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {statusMeta.label}
                          </span>
                          {requiresConfirmation && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Confirmación
                            </span>
                          )}
                          <span className="text-[10px] font-semibold text-slate-500">
                            {formatActionDate(item.created_at)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">Intención</span>
                            <span className="text-slate-300 font-semibold">{item.detected_intent || 'Sin intención'}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">Herramienta</span>
                            <span className="text-slate-300 font-semibold">{item.selected_tool || 'none'}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">Motor</span>
                            <span className="text-slate-300 font-semibold">{item.nlp_engine || 'regex'}</span>
                          </div>
                        </div>

                        {item.error_message && (
                          <p className="text-[10px] text-rose-300">
                            {item.error_message}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-left lg:text-right">
                        <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">Latencia</span>
                        <span className="text-xs font-black text-white">{Number(item.latency_ms || 0)} ms</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Sección 3: Datos de Usuario y Base de Datos (Mantenimiento) */}
      <section className="p-6 bg-dark-card border border-dark-border/40 rounded-3xl space-y-6">
        <h3 className="text-sm font-bold text-slate-350 uppercase tracking-widest flex items-center">
          <Database className="h-4.5 w-4.5 text-accent-400 mr-2" />
          Base de Datos y Respaldo
        </h3>
        
        <p className="text-slate-400 text-xs">
          MapleVault almacena toda la información de forma estrictamente local en tu computadora. Utiliza estas herramientas para respaldar o migrar tu colección.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Backup físico */}
          <div className="p-4 bg-slate-900/40 border border-dark-border/60 rounded-2xl flex flex-col justify-between space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-200 block">Copia de Seguridad SQLite</span>
              <p className="text-[10px] text-slate-500 mt-0.5">Clona el archivo de la base de datos física actual.</p>
            </div>
            {backupStatus && (
              <p
                role="status"
                aria-live="polite"
                className="text-[10px] text-primary-400 italic font-semibold"
              >
                {backupStatus}
              </p>
            )}
            <button
              type="button"
              onClick={handleCreateBackup}
              disabled={backupCreating || Boolean(restoringBackup)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-755 border border-dark-border text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FolderLock className={`h-4 w-4 text-slate-450 ${backupCreating ? 'animate-pulse' : ''}`} />
              <span>{backupCreating ? 'Creando respaldo...' : 'Respaldar DB SQLite'}</span>
            </button>
          </div>

          {/* Importación/Exportación */}
          <div className="p-4 bg-slate-900/40 border border-dark-border/60 rounded-2xl flex flex-col justify-between space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-200 block">Exportar/Importar Biblioteca (JSON)</span>
              <p className="text-[10px] text-slate-500 mt-0.5">Ideal para migrar datos entre computadoras de forma ligera.</p>
            </div>
            
            {importStatus && (
              <p className="text-[10px] text-cyan-400 italic font-semibold">{importStatus}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExportData}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-755 border border-dark-border text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Download className="h-4 w-4 text-slate-450" />
                <span>Exportar JSON</span>
              </button>

              <label className="flex-1 py-2 bg-slate-800 hover:bg-slate-755 border border-dark-border text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer text-center">
                <Upload className="h-4 w-4 text-slate-450" />
                <span>Importar JSON</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportData}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="border-t border-dark-border/60 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-200">Copias SQLite disponibles</span>
              <p className="mt-0.5 text-[10px] text-slate-500">
                La restauración valida la integridad y mantiene una copia de emergencia de los datos actuales.
              </p>
            </div>
            <button
              type="button"
              onClick={loadDatabaseBackups}
              disabled={backupListLoading || Boolean(restoringBackup)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-dark-border bg-slate-900 text-slate-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              title="Actualizar lista de copias"
              aria-label="Actualizar lista de copias"
            >
              <RefreshCw className={`h-4 w-4 ${backupListLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {backupListError && (
            <p className="text-[10px] font-semibold text-rose-300">{backupListError}</p>
          )}

          {!backupListLoading && !backupListError && databaseBackups.length === 0 && (
            <p className="border border-dashed border-dark-border px-3 py-4 text-center text-[11px] text-slate-500">
              Aún no hay copias SQLite disponibles.
            </p>
          )}

          {databaseBackups.length > 0 && (
            <div className="max-h-64 divide-y divide-dark-border/50 overflow-y-auto border border-dark-border/60">
              {databaseBackups.map(backup => {
                const isEmergency = backup.name.startsWith('emergency_before_restore_');
                const isRestoring = restoringBackup === backup.name;

                return (
                  <div
                    key={backup.name}
                    className="flex flex-col gap-3 bg-slate-950/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[11px] font-bold text-slate-200">{backup.name}</span>
                        {isEmergency && (
                          <span className="border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">
                            Emergencia
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {formatBackupDate(backup.createdAt)} · {formatBackupSize(backup.sizeBytes)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestoreBackup(backup)}
                      disabled={Boolean(restoringBackup) || backupCreating}
                      className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 border border-cyan-500/30 bg-cyan-500/10 px-3 text-[10px] font-bold text-cyan-300 transition-colors hover:bg-cyan-500/15 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Restaurar ${backup.name}`}
                    >
                      <RotateCcw className={`h-3.5 w-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                      <span>{isRestoring ? 'Restaurando...' : 'Restaurar'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ZONA DE PELIGRO SIMPLIFICADA */}
      <section className="p-6 bg-dark-card border border-dark-border/40 rounded-3xl space-y-4">
        <h3 className="text-sm font-bold text-red-500 uppercase tracking-wider flex items-center">
          Gestión de Catálogo
        </h3>
        
        <p className="text-slate-400 text-xs">
          Elimina todos los animes sincronizados de la base de datos local.
        </p>

        <div className="flex items-center space-x-3 pb-2">
          <input
            type="checkbox"
            id="keep-userlist-checkbox"
            checked={keepUserList}
            onChange={(e) => setKeepUserList(e.target.checked)}
            className="h-4 w-4 accent-red-600 cursor-pointer"
          />
          <label htmlFor="keep-userlist-checkbox" className="text-xs font-bold text-slate-200 cursor-pointer select-none">
            Conservar mi lista personal
          </label>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            if (await showConfirm("¿Estás seguro de que deseas vaciar el catálogo sincronizado? Esta acción no se puede deshacer.")) {
              handleClearCatalog();
            }
          }}
          className="w-full sm:w-auto px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-md transition-colors cursor-pointer text-center disabled:bg-red-800"
        >
          {saving ? 'Vaciando...' : 'VACIAR CATÁLOGO SINCRONIZADO'}
        </button>
      </section>

      {/* Sección: Borrado de Memoria NLP */}
      <section className="p-6 bg-dark-card border border-dark-border/40 rounded-3xl space-y-4">
        <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest flex items-center">
          Memoria del Asistente NLP
        </h3>
        <p className="text-slate-400 text-xs">
          Borra permanentemente la memoria de preferencias del asistente Maple, incluyendo géneros favoritos, contexto de recomendaciones y búsquedas previas.
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            if (await showConfirm("¿Estás seguro de que deseas vaciar la memoria de preferencias del bot? Olvidará tus gustos.")) {
              handleClearBotMemory();
            }
          }}
          className="w-full sm:w-auto px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-md transition-colors cursor-pointer text-center disabled:bg-red-800"
        >
          {saving ? 'Borrando...' : 'BORRAR MEMORIA DEL BOT'}
        </button>
      </section>
    </div>
  );
};
