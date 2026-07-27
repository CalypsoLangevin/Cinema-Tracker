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
  syncStatus: SyncStatus;
  login: (token: string, repo: string) => Promise<void>;
  logout: () => void;
  forceSync: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  token: null,
  repo: null,
  loading: true,
  error: null,
  syncStatus: 'idle',
  login: async () => {},
  logout: () => {},
  forceSync: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function currentStoreSnapshot() {
  const s = useStore.getState();
  return {
    movies: s.movies,
    shows: s.shows,
    watchlist: s.watchlist,
    favorites: s.favorites,
    hiddenShows: s.hiddenShows,
    theme: s.theme,
  };
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  // Refs so callbacks always see the latest token/repo without re-registering
  const tokenRef = useRef<string | null>(null);
  const repoRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const doSave = useCallback(async () => {
    const tok = tokenRef.current ?? loadToken();
    const rep = repoRef.current ?? loadRepo();
    if (!tok || !rep) { console.log('[sync] skipped — no session'); return; }
    if (savingRef.current) { console.log('[sync] skipped — already saving'); return; }
    savingRef.current = true;
    setSyncStatus('saving');
    try {
      console.log('[sync] saving…');
      await saveToRepo(tok, rep, currentStoreSnapshot());
      console.log('[sync] saved ok');
      setSyncStatus('saved');
    } catch (e) {
      console.error('[sync] save failed:', e);
      setSyncStatus('error');
      throw e;
    } finally {
      savingRef.current = false;
    }
  }, []);

  const scheduleSync = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(), 2000);
  }, [doSave]);

  const forceSync = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await doSave();
  }, [doSave]);

  const login = useCallback(async (tok: string, rep: string) => {
    setError(null);
    setLoading(true);
    const tokenOk = await validateToken(tok);
    if (!tokenOk) {
      setError('Invalid token — make sure it has the repo scope.');
      setLoading(false);
      return;
    }
    const repoOk = await validateRepo(tok, rep);
    if (!repoOk) {
      setError(`Repo "${rep}" not found or not accessible with this token.`);
      setLoading(false);
      return;
    }
    saveToken(tok);
    saveRepo(rep);
    tokenRef.current = tok;
    repoRef.current = rep;
    try {
      const remote = await loadFromRepo(tok, rep);
      if (remote) applyState(remote);
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
    clearToken();
    clearRepo();
    tokenRef.current = null;
    repoRef.current = null;
    setToken(null);
    setRepo(null);
    setSyncStatus('idle');
    // Do NOT wipe the store — data stays in GitHub, loads back on next login
  }, []);

  // On mount: restore session and load from repo
  useEffect(() => {
    const tok = loadToken();
    const rep = loadRepo();
    if (!tok || !rep) { setLoading(false); return; }
    tokenRef.current = tok;
    repoRef.current = rep;
    (async () => {
      const tokenOk = await validateToken(tok);
      if (!tokenOk) {
        clearToken(); clearRepo();
        tokenRef.current = null; repoRef.current = null;
        setLoading(false);
        return;
      }
      try {
        console.log('[auth] loading from repo…');
        const remote = await loadFromRepo(tok, rep);
        console.log('[auth] loaded:', remote ? `keys: ${Object.keys(remote).join(', ')}` : 'null');
        if (remote) applyState(remote);
        setSyncStatus('saved');
      } catch (e) {
        console.error('[auth] load failed:', e);
        setSyncStatus('error');
      }
      setToken(tok);
      setRepo(rep);
      setLoading(false);
    })();
  }, []);

  // Sync on every store change (debounced)
  useEffect(() => {
    if (!token || !repo) return;
    const unsub = useStore.subscribe(() => scheduleSync());
    return unsub;
  }, [token, repo, scheduleSync]);

  // Periodic sync every 30 seconds as a safety net
  useEffect(() => {
    if (!token || !repo) return;
    const interval = setInterval(() => doSave(), 30_000);
    return () => clearInterval(interval);
  }, [token, repo, doSave]);

  return (
    <AuthContext.Provider value={{ token, repo, loading, error, syncStatus, login, logout, forceSync }}>
      {children}
    </AuthContext.Provider>
  );
}
