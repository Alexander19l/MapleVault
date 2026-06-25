import React from 'react';
import { Search, RefreshCw } from 'lucide-react';

interface TopbarProps {
  activePage: string;
  onSearchChange?: (val: string) => void;
  searchValue?: string;
  onSyncLocalData?: () => void;
  syncing?: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({
  activePage,
  onSearchChange,
  searchValue = '',
  onSyncLocalData,
  syncing = false
}) => {
  const getPageTitle = () => {
    switch (activePage) {
      case 'home': return 'Inicio';
      case 'catalog': return 'Biblioteca Local';
      case 'seasons': return 'Explorador por Temporadas';
      case 'mylist': return 'Mi Lista de Seguimiento';
      case 'favorites': return 'Mis Favoritos';
      case 'pending': return 'Mis Series Pendientes';
      case 'recommendations': return 'Recomendaciones de Maple Assistant';
      case 'search_online': return 'Búsqueda Online';
      case 'scraping': return 'Consola de Scraping';
      case 'settings': return 'Configuración de Sistema';
      default: return 'MapleVault';
    }
  };

  const showSearch = ['catalog', 'mylist', 'favorites', 'pending', 'search_online'].includes(activePage);

  return (
    <header className="h-11 bg-slate-950/45 border-b border-[var(--border-medium)] flex items-center justify-between px-6 shrink-0 select-none z-30 titlebar">
      {/* Breadcrumb Title */}
      <div className="flex items-center space-x-2 text-xs">
        <span className="text-[var(--text-dim)]">MapleVault</span>
        <span className="text-[var(--border-medium)]">/</span>
        <span className="text-[var(--text-main)] font-semibold">{getPageTitle()}</span>
      </div>

      {/* Center Search Bar */}
      {showSearch && onSearchChange && (
        <div className="w-80 relative no-drag">
          <input
            type="text"
            placeholder={activePage === 'search_online' ? "Buscar anime en AniList..." : "Filtrar por título, género, estudio..."}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-900/60 border border-[var(--border-medium)] hover:border-slate-700 focus:border-[var(--accent-primary)] focus:outline-none rounded-lg py-1 px-3 pl-8 text-xs text-[var(--text-main)] placeholder-[var(--text-dim)] transition-colors"
          />
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-dim)]" />
        </div>
      )}

      {/* Right Controls */}
      <div className="flex items-center space-x-3 no-drag">
        {onSyncLocalData && (
          <button
            onClick={onSyncLocalData}
            disabled={syncing}
            title="Sincronizar base de datos"
            className="p-1.5 hover:bg-slate-800 rounded-lg text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </header>
  );
};
