import { useState, useEffect, lazy, Suspense } from 'react';
import { Sparkles } from 'lucide-react';
import { AppShell } from './components/layout/AppShell';
import { ToastContainer, useToast } from './components/ui/Toast';
import type { NotifyDetail } from './utils/notify';

const ChatPanel = lazy(() => import('./components/chatbot/ChatPanel').then(module => ({ default: module.ChatPanel })));
const AnimeDetailModal = lazy(() => import('./components/AnimeDetailModal').then(module => ({ default: module.AnimeDetailModal })));
const Home = lazy(() => import('./pages/Home').then(module => ({ default: module.Home })));
const Catalog = lazy(() => import('./pages/Catalog').then(module => ({ default: module.Catalog })));
const Seasons = lazy(() => import('./pages/Seasons').then(module => ({ default: module.Seasons })));
const Mylist = lazy(() => import('./pages/Mylist').then(module => ({ default: module.Mylist })));
const Scraping = lazy(() => import('./pages/Scraping').then(module => ({ default: module.Scraping })));
const Settings = lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })));
const AdvancedSearch = lazy(() => import('./components/search/AdvancedSearch').then(module => ({ default: module.AdvancedSearch })));
const Recommendations = lazy(() => import('./pages/Recommendations').then(module => ({ default: module.Recommendations })));

const PageFallback = () => (
  <div className="flex flex-col items-center justify-center py-20 space-y-3">
    <div className="h-8 w-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
    <span className="text-xs text-slate-400">Cargando...</span>
  </div>
);

function App() {
  const [activePage, setActivePage] = useState<string>('home');
  const [selectedAnimeId, setSelectedAnimeId] = useState<number | null>(null);
  const [selectedExternalAnime, setSelectedExternalAnime] = useState<any | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const { toasts, dismissToast, toast } = useToast();

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';

    const handleOpenDetail = (e: any) => {
      handleViewDetails(e.detail.isExternal ? e.detail.data : e.detail.id);
    };
    const handleDataChanged = () => {
      setRefreshTrigger(current => current + 1);
    };
    window.addEventListener('openAnimeDetail', handleOpenDetail);
    window.addEventListener('maplevault:data-changed', handleDataChanged);

    return () => {
      window.removeEventListener('openAnimeDetail', handleOpenDetail);
      window.removeEventListener('maplevault:data-changed', handleDataChanged);
    };
  }, []);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<NotifyDetail>).detail;
      if (!detail?.message) return;
      toast[detail.type]?.(detail.message, detail.duration);
    };

    window.addEventListener('maplevault:toast', handleToast);
    return () => window.removeEventListener('maplevault:toast', handleToast);
  }, [toast]);

  useEffect(() => {
    if (chatOpen) {
      setChatMounted(true);
      return;
    }

    if (!chatMounted) return;

    const unmountTimer = window.setTimeout(() => {
      setChatMounted(false);
    }, 240);

    return () => window.clearTimeout(unmountTimer);
  }, [chatOpen, chatMounted]);

  const handleOpenChat = () => {
    setChatMounted(true);
    setChatOpen(true);
  };

  const handleCloseChat = () => {
    setChatOpen(false);
  };

  const handleRefreshData = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleViewDetails = (idOrAnime: number | any) => {
    if (typeof idOrAnime === 'number') {
      setSelectedAnimeId(idOrAnime);
      setSelectedExternalAnime(null);
    } else {
      setSelectedExternalAnime(idOrAnime);
      setSelectedAnimeId(null);
    }
  };

  // Renderizar la página seleccionada
  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return <Home onViewDetails={handleViewDetails} onNavigate={setActivePage} refreshTrigger={refreshTrigger} />;
      case 'catalog':
        return (
          <Catalog 
            onViewDetails={handleViewDetails} 
            refreshTrigger={refreshTrigger} 
          />
        );
      case 'seasons':
        return <Seasons onViewDetails={handleViewDetails} />;
      case 'mylist':
        return (
          <Mylist 
            onViewDetails={handleViewDetails} 
            refreshTrigger={refreshTrigger} 
          />
        );
      case 'favorites':
        return (
          <Mylist 
            onViewDetails={handleViewDetails} 
            refreshTrigger={refreshTrigger}
            initialTab="favorite"
          />
        );
      case 'pending':
        return (
          <Mylist 
            onViewDetails={handleViewDetails} 
            refreshTrigger={refreshTrigger}
            initialTab="plan_to_watch"
          />
        );
      case 'recommendations':
        return <Recommendations refreshTrigger={refreshTrigger} onViewDetails={handleViewDetails} />;
      case 'adults':
        return (
          <Catalog 
            onViewDetails={handleViewDetails} 
            refreshTrigger={refreshTrigger} 
            isAdultsOnly={true}
          />
        );
      case 'search_online':
        return <AdvancedSearch onViewDetails={handleViewDetails} />;
      case 'scraping':
        return <Scraping />;
      case 'settings':
        return <Settings onRefreshData={handleRefreshData} />;
      default:
        return <Home onViewDetails={handleViewDetails} onNavigate={setActivePage} refreshTrigger={refreshTrigger} />;
    }
  };

  return (
    <>
      <AppShell
        activePage={activePage}
        setActivePage={setActivePage}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
      >
        <Suspense fallback={<PageFallback />}>
          {renderPage()}
        </Suspense>
      </AppShell>

      {/* Floating Action Button */}
      {!chatOpen && (
        <button
          onClick={handleOpenChat}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white shadow-2xl maple-interactive z-[60] flex items-center justify-center cursor-pointer animate-fadeIn"
          aria-label="Abrir Maple Assistant"
          title="Abrir Maple Assistant"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Panel de Chat de Maple Assistant */}
      {chatMounted && (
        <Suspense fallback={null}>
          <ChatPanel 
            isOpen={chatOpen} 
            onClose={handleCloseChat} 
          />
        </Suspense>
      )}

      {/* Modal de Detalle de Anime */}
      {(selectedAnimeId !== null || selectedExternalAnime !== null) && (
        <Suspense fallback={null}>
          <AnimeDetailModal
            animeId={selectedAnimeId}
            externalAnime={selectedExternalAnime}
            onClose={() => {
              setSelectedAnimeId(null);
              setSelectedExternalAnime(null);
            }}
            onRefresh={handleRefreshData}
          />
        </Suspense>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default App;
