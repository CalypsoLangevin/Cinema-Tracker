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
  const { token, loading } = useAuth();
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
