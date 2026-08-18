import React from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { TitleBar } from '../TitleBar';

interface AppShellProps {
  children: React.ReactNode;
  activePage: string;
  setActivePage: (page: string) => void;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  onSyncLocalData?: () => void;
  syncing?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  activePage,
  setActivePage,
  searchValue = '',
  onSearchChange,
  onSyncLocalData,
  syncing = false
}) => {
  return (
    <div className="flex flex-col bg-dark-bg h-screen overflow-hidden text-slate-100 selection:bg-[var(--accent-primary)]/30">
      {/* 1. Frameless Custom TitleBar */}
      <TitleBar />

      {/* 2. Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar Menu */}
        <Sidebar 
          activePage={activePage} 
          setActivePage={setActivePage} 
        />

        {/* Content Panel Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Top contextual header bar */}
          <Topbar 
            activePage={activePage} 
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            onSyncLocalData={onSyncLocalData}
            syncing={syncing}
          />

          {/* Actual Page Render Area */}
          <main className="flex-1 overflow-y-auto bg-[var(--bg-primary)] p-6 relative scroll-smooth">
            <div key={activePage} className="maple-page-enter min-h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
