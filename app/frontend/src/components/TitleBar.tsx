import React, { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';
import mapleLeaf from '../assets/maple-leaf.svg';

export const TitleBar: React.FC = () => {
  const [isElectron, setIsElectron] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if ((window as any).electronAPI) {
      setIsElectron(true);
      // Check initial maximized state
      (window as any).electronAPI.isMaximized().then((max: boolean) => {
        setIsMaximized(max);
      });

      // We can also poll or listen, but since it's triggered by double click or max button, 
      // simple toggles in click handlers work, or we can check on window resize
      const handleResize = () => {
        (window as any).electronAPI.isMaximized().then((max: boolean) => {
          setIsMaximized(max);
        });
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const handleMinimize = () => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.minimize();
    }
  };

  const handleMaximize = () => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.maximize();
      // Small delay to reflect actual state
      setTimeout(() => {
        (window as any).electronAPI.isMaximized().then((max: boolean) => {
          setIsMaximized(max);
        });
      }, 100);
    }
  };

  const handleClose = () => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.close();
    }
  };

  if (!isElectron) {
    // Return a decorative header or null if running in browser
    return (
      <div className="h-2 bg-slate-900 border-b border-slate-800 shrink-0" />
    );
  }

  return (
    <div className="h-9 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/60 select-none flex items-center justify-between px-3 shrink-0 titlebar z-50">
      {/* Logo y título */}
      <div className="flex items-center space-x-2 text-slate-350">
        <img src={mapleLeaf} alt="" className="h-4 w-4 object-contain" draggable={false} />
        <span className="text-xs font-bold tracking-wide text-slate-200">MapleVault</span>
      </div>

      {/* Controles de ventana */}
      <div className="flex items-center h-full no-drag">
        {/* Minimizar */}
        <button
          onClick={handleMinimize}
          title="Minimizar"
          className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-slate-800/80 hover:text-slate-100 transition-colors"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        {/* Maximizar */}
        <button
          onClick={handleMaximize}
          title={isMaximized ? "Restaurar" : "Maximizar"}
          className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-slate-800/80 hover:text-slate-100 transition-colors"
        >
          <Square className="h-3 w-3" />
        </button>

        {/* Cerrar */}
        <button
          onClick={handleClose}
          title="Cerrar"
          className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-rose-600 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
