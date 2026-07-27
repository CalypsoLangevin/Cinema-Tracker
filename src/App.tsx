import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { useStore } from './store';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { Discover } from './pages/Discover';
import { SearchPage } from './pages/Search';
import { Movies } from './pages/Movies';
import { MovieDetail } from './pages/MovieDetail';
import { Shows } from './pages/Shows';
import { ShowDetail } from './pages/ShowDetail';
import { Watchlist } from './pages/Watchlist';
import { Stats } from './pages/Stats';
import { Import } from './pages/Import';

function AppShell() {
  const { token, loading, loadError, forceSync } = useAuth();
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) return <Login />;

  return (
    <>
    {loadError && (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-red-900/90 text-red-200 text-xs px-4 py-2 flex items-center justify-between gap-4">
        <span>⚠ Failed to load data from GitHub: <strong>{loadError}</strong></span>
        <button onClick={forceSync} className="underline shrink-0">Retry</button>
      </div>
    )}
    <div className="min-h-screen pb-16 sm:pb-0">
      <Navbar />
      <Routes>
        <Route path="/" element={<Discover />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/movie/:id" element={<MovieDetail />} />
        <Route path="/shows" element={<Shows />} />
        <Route path="/tv/:id" element={<ShowDetail />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/import" element={<Import />} />
      </Routes>
    </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/Cinema-Tracker">
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
