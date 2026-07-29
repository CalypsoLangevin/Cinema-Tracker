import { useState, useRef } from 'react';
import { useStore } from '../store';
import { useAuth } from '../lib/auth';
import type { TrackedMovie, TrackedShow } from '../types';
import { Cloud, CloudOff, Loader } from 'lucide-react';

const BASE = 'https://api.themoviedb.org/3';
const KEY = import.meta.env.VITE_TMDB_API_KEY ?? '';

interface MovieCsvRow {
  imdb_id: string;
  title: string;
  year: string;
  watched_at: string;
  is_watched: string;
  rewatch_count: string;
  created_at: string;
}

interface EpisodeCsvRow {
  series_tvdb_id: string;
  series_imdb_id: string;
  title: string;
  season: string;
  episode: string;
  tvdb_id: string;
  is_watched: string;
  watched_at: string;
  rewatch_count: string;
  special: string;
}

interface ImportResult {
  title: string;
  status: 'imported' | 'watchlist' | 'skipped' | 'error';
  reason?: string;
}

async function findMovieByImdbId(imdbId: string) {
  const url = new URL(`${BASE}/find/${imdbId}`);
  url.searchParams.set('api_key', KEY);
  url.searchParams.set('external_source', 'imdb_id');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  return data.movie_results?.[0] ?? null;
}

async function findShowByTvdbId(tvdbId: string) {
  const url = new URL(`${BASE}/find/${tvdbId}`);
  url.searchParams.set('api_key', KEY);
  url.searchParams.set('external_source', 'tvdb_id');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  return data.tv_results?.[0] ?? null;
}

async function fetchMovieDetails(tmdbId: number) {
  const url = new URL(`${BASE}/movie/${tmdbId}`);
  url.searchParams.set('api_key', KEY);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

async function fetchShowDetails(tmdbId: number) {
  const url = new URL(`${BASE}/tv/${tmdbId}`);
  url.searchParams.set('api_key', KEY);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

function parseCsv<T>(text: string): T[] {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes;
      } else if (line[i] === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += line[i];
      }
    }
    fields.push(current);
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (fields[i] ?? '').trim()])) as T;
  });
}

function detectCsvType(text: string): 'movies' | 'episodes' | 'unknown' {
  const firstLine = text.split('\n')[0].toLowerCase();
  if (firstLine.includes('series_tvdb_id')) return 'episodes';
  if (firstLine.includes('imdb_id') && !firstLine.includes('series')) return 'movies';
  return 'unknown';
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function Import() {
  const [results, setResults] = useState<ImportResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const store = useStore();
  const { forceSync, pauseSync, resumeSync, token, repo } = useAuth();

  async function syncToGithub() {
    if (!token || !repo) {
      setSyncError('Not logged in');
      setSyncStatus('error');
      return;
    }
    setSyncStatus('saving');
    setSyncError('');
    try {
      await forceSync();
      setSyncStatus('saved');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[import] sync failed:', msg);
      setSyncError(msg);
      setSyncStatus('error');
    }
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const type = detectCsvType(text);

    if (type === 'unknown') {
      setResults([{ title: file.name, status: 'error', reason: 'Unrecognised CSV format' }]);
      setDone(true);
      return;
    }

    pauseSync();
    if (type === 'movies') {
      await importMovies(text);
    } else {
      await importEpisodes(text);
    }
    resumeSync();
  }

  async function importMovies(text: string) {
    const rows = parseCsv<MovieCsvRow>(text).filter(
      (r) => r.is_watched === 'true' || r.is_watched === 'false'
    );

    setRunning(true);
    setDone(false);
    setResults([]);
    setTotal(rows.length);
    setProgress(0);

    const resultList: ImportResult[] = [];

    for (const row of rows) {
      const rewatchCount = parseInt(row.rewatch_count ?? '0', 10) || 0;
      const isWatched = row.is_watched === 'true';

      try {
        let tmdbMovie: { id: number; title: string; poster_path: string | null; release_date: string; runtime: number | null } | null = null;

        if (row.imdb_id) {
          const found = await findMovieByImdbId(row.imdb_id);
          if (found) {
            const details = await fetchMovieDetails(found.id);
            tmdbMovie = {
              id: details.id,
              title: details.title,
              poster_path: details.poster_path,
              release_date: details.release_date,
              runtime: details.runtime ?? null,
            };
          }
        }

        if (!tmdbMovie) {
          resultList.push({ title: row.title, status: 'skipped', reason: 'Not found on TMDB' });
          setResults([...resultList]);
          setProgress((p) => p + 1);
          await sleep(300);
          continue;
        }

        if (isWatched) {
          const trackedMovie: TrackedMovie = {
            ...tmdbMovie,
            watchCount: rewatchCount + 1,
            lastWatched: row.watched_at || row.created_at,
          };
          useStore.setState((s) => ({ movies: { ...s.movies, [tmdbMovie!.id]: trackedMovie } }));
          resultList.push({ title: tmdbMovie.title, status: 'imported' });
        } else {
          store.addToWatchlist(tmdbMovie.id, 'movie');
          resultList.push({ title: tmdbMovie.title, status: 'watchlist' });
        }
      } catch (e) {
        resultList.push({ title: row.title, status: 'error', reason: String(e) });
      }

      setResults([...resultList]);
      setProgress((p) => p + 1);
      await sleep(100);
    }

    setRunning(false);
    await syncToGithub();
    setDone(true);
  }

  async function importEpisodes(text: string) {
    const rows = parseCsv<EpisodeCsvRow>(text).filter(
      (r) => r.is_watched === 'true' && r.special !== 'true' && r.series_tvdb_id
    );

    setRunning(true);
    setDone(false);
    setResults([]);
    setTotal(rows.length);
    setProgress(0);

    const resultList: ImportResult[] = [];

    // Group episodes by series so we only fetch show details once per series
    const byShow = new Map<string, EpisodeCsvRow[]>();
    for (const row of rows) {
      const key = row.series_tvdb_id;
      if (!byShow.has(key)) byShow.set(key, []);
      byShow.get(key)!.push(row);
    }

    // Cache of tvdb_id -> TMDB show details (null = not found)
    const showCache = new Map<string, TrackedShow | null>();

    for (const row of rows) {
      const tvdbId = row.series_tvdb_id;
      const label = `${row.title} S${row.season.padStart(2,'0')}E${row.episode.padStart(2,'0')}`;

      try {
        // Fetch & cache show details once per series
        if (!showCache.has(tvdbId)) {
          const found = await findShowByTvdbId(tvdbId);
          if (!found) {
            showCache.set(tvdbId, null);
          } else {
            const details = await fetchShowDetails(found.id);
            const trackedShow: TrackedShow = {
              id: details.id,
              name: details.name,
              poster_path: details.poster_path,
              first_air_date: details.first_air_date,
              episode_run_time: details.episode_run_time ?? [],
              watchedEpisodes: [],
              status: 'watching',
              _totalEpisodes: details.number_of_episodes ?? 0,
              _hasUpcoming: !!details.next_episode_to_air,
            } as TrackedShow & { _totalEpisodes: number; _hasUpcoming: boolean };
            showCache.set(tvdbId, trackedShow);
            // Register show in store if not already there
            store.addShow(trackedShow);
          }
          await sleep(150);
        }

        const show = showCache.get(tvdbId);
        if (!show) {
          resultList.push({ title: label, status: 'skipped', reason: 'Show not found on TMDB' });
          setResults([...resultList]);
          setProgress((p) => p + 1);
          continue;
        }

        const seasonNum = parseInt(row.season, 10);
        const episodeNum = parseInt(row.episode, 10);
        if (isNaN(seasonNum) || isNaN(episodeNum)) {
          resultList.push({ title: label, status: 'skipped', reason: 'Invalid season/episode number' });
          setResults([...resultList]);
          setProgress((p) => p + 1);
          continue;
        }

        store.logEpisode(
          show.id,
          { seasonNumber: seasonNum, episodeNumber: episodeNum },
          row.watched_at || undefined
        );

        resultList.push({ title: label, status: 'imported' });
      } catch (e) {
        resultList.push({ title: label, status: 'error', reason: String(e) });
      }

      setResults([...resultList]);
      setProgress((p) => p + 1);
      await sleep(50);
    }

    // Auto-complete shows where all episodes are watched and no upcoming episodes
    for (const [, show] of showCache) {
      if (!show) continue;
      const ext = show as TrackedShow & { _totalEpisodes?: number; _hasUpcoming?: boolean };
      const watched = useStore.getState().shows[ext.id]?.watchedEpisodes.length ?? 0;
      if (!ext._hasUpcoming && (ext._totalEpisodes ?? 0) > 0 && watched >= ext._totalEpisodes!) {
        store.setShowStatus(ext.id, 'completed');
      }
    }

    setRunning(false);
    await syncToGithub();
    setDone(true);
  }

  const imported = results.filter((r) => r.status === 'imported').length;
  const watchlisted = results.filter((r) => r.status === 'watchlist').length;
  const skipped = results.filter((r) => r.status === 'skipped' || r.status === 'error').length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Import from TV Time</h1>
      <p className="text-zinc-400 mb-6 text-sm">
        Upload your TV Time CSV export — movies or episodes. Watched items are imported with their history; unwatched movies go to your Watchlist.
      </p>

      {!running && !done && (
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 rounded-xl p-10 cursor-pointer hover:border-brand transition-colors">
          <span className="text-zinc-400 mb-2">Drop CSV file here or click to browse</span>
          <span className="text-xs text-zinc-600">tvtime-movies-*.csv · tvtime-episodes-*.csv</span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
      )}

      {(running || done) && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-zinc-800 rounded-full h-2">
              <div
                className="bg-brand h-2 rounded-full transition-all duration-300"
                style={{ width: total ? `${(progress / total) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-sm text-zinc-400 whitespace-nowrap">{progress} / {total}</span>
          </div>

          {done && (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-4 text-sm">
                <span className="text-green-400">✓ {imported} imported</span>
                {watchlisted > 0 && <span className="text-zinc-400">⊕ {watchlisted} to watchlist</span>}
                <span className="text-red-400">✗ {skipped} skipped</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {syncStatus === 'saving' && <><Loader size={14} className="animate-spin text-zinc-400" /><span className="text-zinc-400">Saving to GitHub…</span></>}
                {syncStatus === 'saved' && <><Cloud size={14} className="text-green-400" /><span className="text-green-400">Saved to GitHub</span></>}
                {syncStatus === 'error' && <><CloudOff size={14} className="text-red-400" /><span className="text-red-400">GitHub save failed{syncError ? `: ${syncError}` : ''}</span><button onClick={syncToGithub} className="underline text-red-400 hover:text-red-300 ml-1">Retry</button></>}
              </div>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto space-y-1 pr-1">
            {[...results].reverse().map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm py-1 border-b border-zinc-800">
                <span className={
                  r.status === 'imported' ? 'text-green-400' :
                  r.status === 'watchlist' ? 'text-zinc-400' :
                  'text-red-400'
                }>
                  {r.status === 'imported' ? '✓' : r.status === 'watchlist' ? '⊕' : '✗'}
                </span>
                <span className="flex-1 truncate text-zinc-200">{r.title}</span>
                {r.reason && <span className="text-xs text-zinc-500 shrink-0">{r.reason}</span>}
              </div>
            ))}
          </div>

          {done && (
            <button
              onClick={() => {
                setDone(false);
                setResults([]);
                setProgress(0);
                setTotal(0);
                if (fileRef.current) fileRef.current.value = '';
              }}
              className="mt-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
            >
              Import another file
            </button>
          )}
        </div>
      )}
    </div>
  );
}
