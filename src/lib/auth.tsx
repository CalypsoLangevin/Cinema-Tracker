import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  saveToken, loadToken, clearToken,
  saveRepo, loadRepo, clearRepo,
  validateToken, validateRepo,
  loadFromRepo, saveToRepo,
} from './github-storage';
import { useStore } from '../store';

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

interface AuthState {
  token: string | null;
  repo: string | null;
  loading: boolean;
  error: string | null;
  loadError: string | null;
  syncStatus: SyncStatus;
  login: (token: string, repo: string) => Promise<void>;
  logout: () => void;
  forceSync: () => Promise<void>;
  pauseSync: () => void;
  resumeSync: () => void;
}

const AuthContext = createContext<AuthState>({
  token: null, repo: null, loading: true, error: null, loadError: null, syncStatus: 'idle',
  login: async () => {}, logout: () => {}, forceSync: async () => {},
  pauseSync: () => {}, resumeSync: () => {},
});

export function useAuth() { return useContext(AuthContext); }

function snapshot() {
  const s = useStore.getState();
  return { movies: s.movies, shows: s.shows, watchlist: s.watchlist, favorites: s.favorites, hiddenShows: s.hiddenShows, theme: s.theme };
}

function applyState(data: Record<string, unknown>) {
  useStore.setState({
    movies: (data.movies as ReturnType<typeof useStore.getState>['movies']) ?? {},
    shows: (data.shows as ReturnType<typeof useStore.getState>['shows']) ?? {},
    watchlist: (data.watchlist as ReturnType<typeof useStore.getState>['watchlist']) ?? [],
    favorites: (data.favorites as ReturnType<typeof useStore.getState>['favorites']) ?? [],
    hiddenShows: (data.hiddenShows as ReturnType<typeof useStore.getState>['hiddenShows']) ?? [],
    theme: (data.theme as 'dark' | 'light') ?? 'dark',
  });
}

const BASE = 'https://api.themoviedb.org/3';
const KEY = import.meta.env.VITE_TMDB_API_KEY ?? '';

async function fixCompletedShows(doSave: () => Promise<void>) {
  const shows = useStore.getState().shows;
  const watchingIds = Object.keys(shows).map(Number).filter((id) => shows[id].status === 'watching');
  if (!watchingIds.length) return;
  let anyChanged = false;
  for (const id of watchingIds) {
    const tracked = shows[id];
    try {
      const res = await fetch(`${BASE}/tv/${id}?api_key=${KEY}`);
      if (!res.ok) continue;
      const details = await res.json();
      const totalEps = (details.seasons as Array<{ season_number: number; episode_count: number }>)
        .filter((s: { season_number: number }) => s.season_number > 0)
        .reduce((acc: number, s: { episode_count: number }) => acc + s.episode_count, 0);
      const watched = tracked.watchedEpisodes.length;
      if (!details.next_episode_to_air && totalEps > 0 && watched >= totalEps) {
        useStore.getState().setShowStatus(id, 'completed');
        anyChanged = true;
      }
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // skip on network error
    }
  }
  if (anyChanged) {
    try { await doSave(); } catch { /* best-effort */ }
  }
}

function hasData(data: Record<string, unknown> | null): boolean {
  if (!data) return false;
  return (
    Object.keys(data.movies as object ?? {}).length > 0 ||
    Object.keys(data.shows as object ?? {}).length > 0 ||
    ((data.favorites as unknown[]) ?? []).length > 0 ||
    ((data.watchlist as unknown[]) ?? []).length > 0
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  const tokenRef = useRef<string | null>(null);
  const repoRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncPausedRef = useRef(false);

  const doSave = useCallback(async () => {
    const tok = tokenRef.current;
    const rep = repoRef.current;
    if (!tok || !rep) return;
    setSyncStatus('saving');
    try {
      await saveToRepo(tok, rep, snapshot());
      setSyncStatus('saved');
    } catch (e) {
      console.error('[sync] failed:', e);
      setSyncStatus('error');
      throw e;
    }
  }, []);

  const scheduleSync = useCallback(() => {
    if (syncPausedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(), 2000);
  }, [doSave]);

  const forceSync = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await doSave();
  }, [doSave]);

  const pauseSync = useCallback(() => {
    syncPausedRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const resumeSync = useCallback(() => {
    syncPausedRef.current = false;
  }, []);

  const login = useCallback(async (tok: string, rep: string) => {
    setError(null);
    setLoading(true);
    if (!await validateToken(tok)) {
      setError('Invalid token — make sure it has the repo scope.');
      setLoading(false);
      return;
    }
    if (!await validateRepo(tok, rep)) {
      setError(`Repo "${rep}" not found or not accessible with this token.`);
      setLoading(false);
      return;
    }
    saveToken(tok);
    saveRepo(rep);
    tokenRef.current = tok;
    repoRef.current = rep;
    // Clear any previous session's data before loading the new repo
    applyState({ movies: {}, shows: {}, watchlist: [], favorites: [], hiddenShows: [], theme: useStore.getState().theme });
    try {
      const remote = await loadFromRepo(tok, rep);
      if (hasData(remote)) {
        applyState(remote!);
        fixCompletedShows(doSave);
      }
      setSyncStatus('saved');
    } catch (e) {
      console.error('[auth] load on login failed:', e);
    }
    setToken(tok);
    setRepo(rep);
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    clearToken(); clearRepo();
    tokenRef.current = null; repoRef.current = null;
    setToken(null); setRepo(null);
    setSyncStatus('idle');
  }, []);

  // On mount: restore session and load from GitHub
  useEffect(() => {
    const tok = loadToken();
    const rep = loadRepo();
    if (!tok || !rep) { setLoading(false); return; }
    tokenRef.current = tok;
    repoRef.current = rep;
    (async () => {
      if (!await validateToken(tok)) {
        clearToken(); clearRepo();
        tokenRef.current = null; repoRef.current = null;
        setLoading(false);
        return;
      }
      try {
        console.log('[auth] loading from GitHub…');
        const remote = await loadFromRepo(tok, rep);
        const movies = Object.keys(remote?.movies as object ?? {}).length;
        const shows = Object.keys(remote?.shows as object ?? {}).length;
        console.log(`[auth] remote: ${movies} movies, ${shows} shows`);
        if (hasData(remote)) {
          applyState(remote!);
          fixCompletedShows(doSave);
        }
        setSyncStatus('saved');
        setLoadError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[auth] load failed:', msg);
        setLoadError(msg);
        setSyncStatus('error');
      }
      setToken(tok);
      setRepo(rep);
      setLoading(false);
    })();
  }, []);

  // Sync on every store change (debounced 2s)
  useEffect(() => {
    if (!token || !repo) return;
    return useStore.subscribe(() => scheduleSync());
  }, [token, repo, scheduleSync]);

  // Periodic sync every 30s as safety net
  useEffect(() => {
    if (!token || !repo) return;
    const id = setInterval(() => {
      if (!syncPausedRef.current) doSave();
    }, 30_000);
    return () => clearInterval(id);
  }, [token, repo, doSave]);

  return (
    <AuthContext.Provider value={{ token, repo, loading, error, loadError, syncStatus, login, logout, forceSync, pauseSync, resumeSync }}>
      {children}
    </AuthContext.Provider>
  );
}
