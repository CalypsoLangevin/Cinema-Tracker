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

function isEmptyState(data: Record<string, unknown>) {
  return (
    Object.keys((data.movies as object) ?? {}).length === 0 &&
    Object.keys((data.shows as object) ?? {}).length === 0 &&
    ((data.watchlist as unknown[]) ?? []).length === 0
  );
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
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(async (tok: string, rep: string) => {
    // Never save if the session has been cleared (logged out)
    if (!loadToken() || !loadRepo()) return;
    const snapshot = currentStoreSnapshot();
    // Never overwrite GitHub with an empty snapshot
    if (isEmptyState(snapshot as Record<string, unknown>)) return;
    setSyncStatus('saving');
    try {
      await saveToRepo(tok, rep, snapshot);
      setSyncStatus('saved');
    } catch (e) {
      console.error('[sync] save failed:', e);
      setSyncStatus('error');
    }
  }, []);

  const scheduleSync = useCallback((tok: string, rep: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(tok, rep), 1500);
  }, [doSave]);

  const forceSync = useCallback(async () => {
    const tok = loadToken();
    const rep = loadRepo();
    if (!tok || !rep) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await doSave(tok, rep);
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
    try {
      const remote = await loadFromRepo(tok, rep);
      if (remote) {
        applyState(remote);
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
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    clearToken();
    clearRepo();
    setToken(null);
    setRepo(null);
    setSyncStatus('idle');
    // Do NOT wipe the store — data stays in GitHub, loads back on next login
  }, []);

  // On mount: restore session and load from repo
  useEffect(() => {
    const tok = loadToken();
    const rep = loadRepo();
    console.log('[auth] mount — token:', tok ? 'yes' : 'no', 'repo:', rep ?? 'none');
    if (!tok || !rep) { setLoading(false); return; }
    (async () => {
      const tokenOk = await validateToken(tok);
      if (!tokenOk) { clearToken(); clearRepo(); setLoading(false); return; }
      try {
        console.log('[auth] loading from repo…');
        const remote = await loadFromRepo(tok, rep);
        console.log('[auth] loaded:', remote ? `${Object.keys(remote).join(', ')}` : 'null (file not found yet)');
        if (remote) {
          applyState(remote);
        }
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

  // Sync to repo on every store change — guard against firing after logout
  useEffect(() => {
    if (!token || !repo) return;
    const unsub = useStore.subscribe(() => {
      // Re-read from storage: if cleared (logout), skip sync
      if (!loadToken() || !loadRepo()) return;
      scheduleSync(token, repo);
    });
    return unsub;
  }, [token, repo, scheduleSync]);

  return (
    <AuthContext.Provider value={{ token, repo, loading, error, syncStatus, login, logout, forceSync }}>
      {children}
    </AuthContext.Provider>
  );
}
