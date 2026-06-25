import React, { useState, useEffect } from 'react';
import { 
  Home, 
  Compass, 
  CalendarDays, 
  UserRound, 
  Heart, 
  Clock, 
  Sparkles, 
  Search,
  Database,
  Settings as SettingsIcon,
  BrainCircuit
} from 'lucide-react';
import { api } from '../../services/api';
import mapleMascot from '../../assets/maple-mascot.png';

interface SidebarProps {
  activePage: string;
  setActivePage: (page: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage, setActivePage }) => {
  const [dbStatus, setDbStatus] = useState<'connected' | 'disconnected'>('connected');
  const [aiStatus, setAiStatus] = useState<'active' | 'inactive'>('inactive');

  useEffect(() => {
    checkConnectionStatus();
  }, [activePage]);

  const checkConnectionStatus = async () => {
    try {
      const aiSettings = await api.getAISettings();
      if (aiSettings && aiSettings.enabled) {
        setDbStatus('connected');
        setAiStatus('active');
      } else {
        setDbStatus('connected');
        setAiStatus('inactive');
      }
    } catch (_err) {
      setDbStatus('disconnected');
      setAiStatus('inactive');
    }
  };

  const navItems = [
    { id: 'home', name: 'Inicio', icon: Home },
    { id: 'catalog', name: 'Catálogo', icon: Compass },
    { id: 'seasons', name: 'Temporadas', icon: CalendarDays },
    { id: 'mylist', name: 'Mi Lista', icon: UserRound },
  ];

  const filterItems = [
    { id: 'favorites', name: 'Favoritos', icon: Heart },
    { id: 'pending', name: 'Pendientes', icon: Clock },
    { id: 'recommendations', name: 'Recomendaciones', icon: Sparkles },
    { id: 'search_online', name: 'Buscar Online', icon: Search },
  ];

  const toolItems = [
    { id: 'scraping', name: 'Scraping', icon: Database },
    { id: 'settings', name: 'Ajustes', icon: SettingsIcon },
  ];

  interface MenuItem {
    id: string;
    name: string;
    icon: any;
    action?: () => void;
  }

  const handleNavClick = (item: MenuItem) => {
    if (item.action) {
      item.action();
    } else {
      setActivePage(item.id);
    }
  };

  return (
    <aside className="w-56 bg-slate-950/70 border-r border-[var(--border-medium)] flex flex-col h-full shrink-0 select-none z-40">
      {/* Brand Header */}
      <div className="p-4 border-b border-[var(--border-medium)] flex items-center space-x-2.5">
        <div className="h-10 w-10 shrink-0 overflow-visible">
          <img
            src={mapleMascot}
            alt="Mascota de MapleVault"
            className="h-full w-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.35)]"
            draggable={false}
          />
        </div>
        <div>
          <h1 className="text-sm font-extrabold tracking-wider text-[var(--text-main)]">
            MapleVault
          </h1>
          <span className="text-[9px] uppercase font-bold tracking-widest text-[var(--text-dim)] block -mt-0.5">
            Local Archive
          </span>
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-5 hide-scrollbar">
        {/* Biblioteca */}
        <div>
          <span className="px-3 text-[9px] uppercase font-bold tracking-widest text-[var(--text-dim)] block mb-1">
            Biblioteca
          </span>
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs maple-interactive cursor-pointer ${
                    isActive 
                      ? 'bg-violet-600/10 text-[var(--accent-primary)] font-bold' 
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon className={`h-4.5 w-4.5 transition-transform duration-200 ${isActive ? 'text-[var(--accent-primary)] scale-105' : 'text-[var(--text-dim)]'}`} />
                    <span>{item.name}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Filtros Rápidos */}
        <div>
          <span className="px-3 text-[9px] uppercase font-bold tracking-widest text-[var(--text-dim)] block mb-1">
            Filtros
          </span>
          <nav className="space-y-0.5">
            {filterItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item)}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs maple-interactive cursor-pointer ${
                    isActive 
                      ? 'bg-violet-600/10 text-[var(--accent-primary)] font-bold' 
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-slate-900/50'
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 transition-transform duration-200 ${isActive ? 'text-[var(--accent-primary)] scale-105' : 'text-[var(--text-dim)]'}`} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Herramientas */}
        <div>
          <span className="px-3 text-[9px] uppercase font-bold tracking-widest text-[var(--text-dim)] block mb-1">
            Herramientas
          </span>
          <nav className="space-y-0.5">
            {toolItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item)}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs maple-interactive cursor-pointer ${
                    isActive 
                      ? 'bg-violet-600/10 text-[var(--accent-primary)] font-bold' 
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-slate-900/50'
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 transition-transform duration-200 ${isActive ? 'text-[var(--accent-primary)] scale-105' : 'text-[var(--text-dim)]'}`} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Connection Badges Footer */}
      <div className="p-3 border-t border-[var(--border-medium)] bg-slate-950/20 space-y-2 select-none">
        {/* SQLite State */}
        <div className="flex items-center justify-between px-1.5">
          <div className="flex items-center space-x-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${dbStatus === 'connected' ? 'bg-[var(--status-completed)]' : 'bg-[var(--status-dropped)]'}`} />
            <span className="text-[10px] text-[var(--text-dim)]">SQLite DB</span>
          </div>
          <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">
            {dbStatus === 'connected' ? 'Conectado' : 'Offline'}
          </span>
        </div>

        {/* AI State */}
        <div className="flex items-center justify-between px-1.5">
          <div className="flex items-center space-x-1.5">
            {aiStatus === 'active' ? (
              <BrainCircuit className="h-3 w-3 text-green-400" />
            ) : (
              <BrainCircuit className="h-3 w-3 text-[var(--text-dim)]" />
            )}
            <span className="text-[10px] text-[var(--text-dim)]">Ollama NLP</span>
          </div>
          <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase">
            {aiStatus === 'active' ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>
    </aside>
  );
};
