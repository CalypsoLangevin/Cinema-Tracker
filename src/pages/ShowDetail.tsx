import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, Eye, EyeOff, Bookmark, BookmarkCheck, Heart, Star, CheckCheck, Check, X, RefreshCw } from 'lucide-react';
import { tmdb, posterUrl, backdropUrl } from '../lib/tmdb';
import { useStore } from '../store';
import type { TMDBEpisode, TMDBShowDetails } from '../types';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface EpisodeRowProps {
  ep: TMDBEpisode;
  showId: number;
  seasonNumber: number;
  watched: boolean;
  watchedAt: string | undefined;
  rewatchDates: string[];
  onLog: (seasonNumber: number, episodeNumber: number, date: string) => void;
  onUnlog: (seasonNumber: number, episodeNumber: number) => void;
  onRewatch: (seasonNumber: number, episodeNumber: number, date: string) => void;
}

function EpisodeRow({ ep, seasonNumber, watched, watchedAt, rewatchDates, onLog, onUnlog, onRewatch }: EpisodeRowProps) {
  const [mode, setMode] = useState<'idle' | 'log' | 'rewatch'>('idle');
  const [date, setDate] = useState(todayStr());

  const openMode = (m: 'log' | 'rewatch') => {
    setDate(todayStr());
    setMode(mode === m ? 'idle' : m);
  };

  const confirmLog = () => {
    onLog(seasonNumber, ep.episode_number, new Date(date).toISOString());
    setMode('idle');
  };

  const confirmRewatch = () => {
    onRewatch(seasonNumber, ep.episode_number, new Date(date).toISOString());
    setMode('idle');
  };

  const totalWatches = watched ? 1 + rewatchDates.length : 0;

  return (
    <div className="border-t border-white/5">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition">
        <span className="text-zinc-600 text-xs w-5 shrink-0 text-right">{ep.episode_number}</span>
        <span className={`flex-1 text-sm ${watched ? 'text-white' : 'text-zinc-400'}`}>{ep.name}</span>
        {watchedAt
          ? <span className="hidden sm:inline text-brand/70 text-xs">{new Date(watchedAt).toLocaleDateString()}</span>
          : ep.air_date && <span className="hidden sm:inline text-zinc-600 text-xs">{ep.air_date?.slice(0, 10)}</span>
        }
        {ep.runtime && <span className="text-zinc-600 text-xs">{ep.runtime}m</span>}
        {totalWatches > 1 && (
          <span className="text-xs text-zinc-500 bg-zinc-700 rounded px-1.5 py-0.5">×{totalWatches}</span>
        )}
        {watched && (
          <button
            onClick={() => openMode('rewatch')}
            className="p-1.5 rounded-full transition shrink-0 bg-zinc-700 text-zinc-400 hover:text-brand"
            title="Log rewatch"
          >
            <RefreshCw size={12} />
          </button>
        )}
        <button
          onClick={() => watched ? onUnlog(seasonNumber, ep.episode_number) : openMode('log')}
          className={`p-1.5 rounded-full transition shrink-0 ${
            watched ? 'bg-brand text-black' : 'bg-zinc-700 text-zinc-400 hover:text-white'
          }`}
        >
          {watched ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
      </div>
      {(mode === 'log' || mode === 'rewatch') && (
        <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
          <span className="text-zinc-400 text-xs">{mode === 'rewatch' ? 'Rewatched on' : 'Watched on'}</span>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="bg-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg border border-white/5 focus:border-brand/50 focus:outline-none"
          />
          <button
            onClick={mode === 'rewatch' ? confirmRewatch : confirmLog}
            className="p-1.5 rounded-lg bg-brand text-black transition"
            title="Confirm"
          >
            <Check size={12} />
          </button>
          <button onClick={() => setMode('idle')} className="p-1.5 rounded-lg bg-zinc-700 text-white transition" title="Cancel">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export function ShowDetail() {
  const { id } = useParams<{ id: string }>();
  const showId = Number(id);
  const [detail, setDetail] = useState<TMDBShowDetails | null>(null);
  const [episodes, setEpisodes] = useState<Record<number, TMDBEpisode[]>>({});
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const { shows, addShow, setShowStatus, logEpisode, unlogEpisode, logEpisodeRewatch, rewatchShow, hasWatchedEpisode, isInWatchlist, addToWatchlist, removeFromWatchlist, isInFavorites, addToFavorites, removeFromFavorites } = useStore();
  const tracked = shows[showId];
  const episodeWatchedAt = (sn: number, en: number) =>
    tracked?.watchedEpisodes.find((e) => e.seasonNumber === sn && e.episodeNumber === en)?.watchedAt;
  const episodeRewatchDates = (sn: number, en: number) =>
    tracked?.watchedEpisodes.find((e) => e.seasonNumber === sn && e.episodeNumber === en)?.rewatchDates ?? [];
  const inList = isInWatchlist(showId, 'tv');
  const [rewatchPanel, setRewatchPanel] = useState(false);
  const [rewatchStart, setRewatchStart] = useState('');
  const [rewatchEnd, setRewatchEnd] = useState('');

  const logEpisodeAndCheck = (sn: number, en: number, date?: string) => {
    // Register the show the first time an episode is logged
    if (!tracked && detail) {
      addShow({
        id: detail.id,
        name: detail.name,
        poster_path: detail.poster_path,
        first_air_date: detail.first_air_date,
        episode_run_time: detail.episode_run_time,
        watchedEpisodes: [],
        status: 'watching',
      });
    }
    logEpisode(showId, { seasonNumber: sn, episodeNumber: en }, date);
    if (!detail) return;
    const totalEps = detail.seasons.reduce((acc, s) => acc + (s.season_number > 0 ? s.episode_count : 0), 0);
    // Read from store after logEpisode has updated it
    const watchedAfter = useStore.getState().shows[showId]?.watchedEpisodes.length ?? 0;
    if (watchedAfter >= totalEps) {
      removeFromWatchlist(showId, 'tv');
      // Only auto-complete if no upcoming episodes
      if (!detail.next_episode_to_air) {
        setShowStatus(showId, 'completed');
      }
    }
  };
  const inFavorites = isInFavorites(showId, 'tv');

  useEffect(() => {
    tmdb.show(showId).then((d) => {
      setDetail(d);
      const existing = useStore.getState().shows[showId];
      // If already tracked as completed but new episodes are coming, restore to watching
      if (existing?.status === 'completed' && !!d.next_episode_to_air) {
        setShowStatus(showId, 'watching');
      }
      // Don't register the show until the user logs an episode — addShow is called in logEpisodeAndCheck
    }).finally(() => setLoading(false));
  }, [showId]);

  const loadSeason = async (n: number) => {
    if (episodes[n]) { setOpenSeason(openSeason === n ? null : n); return; }
    const data = await tmdb.season(showId, n);
    setEpisodes((prev) => ({ ...prev, [n]: data.episodes }));
    setOpenSeason(n);
  };

  const markSeasonAll = (seasonNumber: number, eps: TMDBEpisode[], watched: boolean) => {
    eps.forEach((ep) => {
      if (watched) logEpisodeAndCheck(seasonNumber, ep.episode_number);
      else unlogEpisode(showId, seasonNumber, ep.episode_number);
    });
  };

  const confirmRewatchShow = () => {
    if (!detail) return;
    // Collect all watched episodes in order, keeping the TMDBEpisode for air_date fallback
    const allEps = detail.seasons
      .filter((s) => s.season_number > 0)
      .flatMap((s) => {
        const eps = episodes[s.season_number] ?? [];
        return eps.map((e) => ({ season: s.season_number, episode: e.episode_number, air_date: e.air_date }));
      })
      .filter((ep) => hasWatchedEpisode(showId, ep.season, ep.episode));
    if (!allEps.length) return;

    let dates: string[];
    if (rewatchStart && rewatchEnd) {
      const start = new Date(rewatchStart).getTime();
      const end = new Date(rewatchEnd).getTime();
      const n = allEps.length;
      dates = allEps.map((_, i) =>
        new Date(n === 1 ? end : start + i * (end - start) / (n - 1)).toISOString()
      );
    } else {
      // Fall back to each episode's air date
      dates = allEps.map((ep) =>
        ep.air_date ? new Date(ep.air_date).toISOString() : new Date().toISOString()
      );
    }

    rewatchShow(showId, allEps, dates);
    setRewatchPanel(false);
    setRewatchStart('');
    setRewatchEnd('');
  };

  if (loading) return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-64 bg-zinc-800 rounded-xl" />
      <div className="h-6 bg-zinc-800 rounded w-1/2" />
    </div>
  );
  if (!detail) return <div className="text-zinc-400 p-8">Not found</div>;

  const poster = posterUrl(detail.poster_path, 'w500');
  const backdrop = backdropUrl(detail.backdrop_path ?? null);
  const watchedCount = tracked?.watchedEpisodes.length ?? 0;
  const totalEps = detail.seasons.reduce((acc, s) => acc + (s.season_number > 0 ? s.episode_count : 0), 0);

  const statuses: Array<{ value: TrackedShowStatus; label: string }> = [
    { value: 'watching', label: 'Watching' },
    { value: 'completed', label: 'Completed' },
    { value: 'paused', label: 'Paused' },
    { value: 'dropped', label: 'Dropped' },
  ];

  return (
    <div>
      {/* Hero backdrop */}
      <div className="relative h-56 sm:h-80 overflow-hidden">
        {backdrop
          ? <img src={backdrop} alt="" className="w-full h-full object-cover object-top" />
          : <div className="w-full h-full bg-zinc-800" />
        }
        <div className="hero-overlay absolute inset-0" />
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-24 sm:-mt-32 relative z-10 pb-8 space-y-6">
        <div className="flex flex-col sm:flex-row gap-5 sm:gap-8">
          {/* Poster */}
          <div className="w-28 sm:w-40 shrink-0 mx-auto sm:mx-0 shadow-2xl rounded-xl overflow-hidden ring-2 ring-white/5">
            {poster
              ? <img src={poster} alt={detail.name} className="w-full" />
              : <div className="aspect-[2/3] bg-zinc-700" />
            }
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4 pt-0 sm:pt-16">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-center sm:text-left">{detail.name}</h1>
              <div className="flex items-center justify-center sm:justify-start gap-4 mt-1 text-zinc-400 text-sm flex-wrap">
                <span>{detail.first_air_date?.slice(0, 4)}</span>
                <span>{detail.number_of_seasons} seasons</span>
                <span className="flex items-center gap-1 text-brand">
                  <Star size={12} fill="currentColor" /> {detail.vote_average.toFixed(1)}
                </span>
              </div>
            </div>

            <p className="text-zinc-400 text-sm leading-relaxed max-w-2xl">{detail.overview}</p>

            <div className="flex items-center gap-2 flex-wrap">
              {statuses.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setShowStatus(showId, s.value)}
                  className={`px-3.5 py-1.5 rounded-xl text-sm font-medium border transition ${
                    tracked?.status === s.value
                      ? 'bg-brand/15 border-brand/30 text-brand'
                      : 'bg-zinc-800 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
              {tracked && tracked.watchedEpisodes.length > 0 && (
                <button
                  onClick={() => setRewatchPanel((v) => !v)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium border transition ${
                    rewatchPanel
                      ? 'bg-brand/15 border-brand/30 text-brand'
                      : 'bg-zinc-800 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  <RefreshCw size={13} /> Rewatch
                </button>
              )}
              <button
                onClick={() => inList ? removeFromWatchlist(showId, 'tv') : addToWatchlist(showId, 'tv')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium border transition ${
                  inList
                    ? 'bg-brand/10 border-brand/30 text-brand'
                    : 'bg-zinc-800 border-white/5 text-zinc-300 hover:text-white hover:bg-zinc-700'
                }`}
              >
                {inList ? <><BookmarkCheck size={13} /> In Watchlist</> : <><Bookmark size={13} /> Watchlist</>}
              </button>
              <button
                onClick={() => inFavorites ? removeFromFavorites(showId, 'tv') : addToFavorites(showId, 'tv')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium border transition ${
                  inFavorites
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-zinc-800 border-white/5 text-zinc-300 hover:text-white hover:bg-zinc-700'
                }`}
              >
                <Heart size={13} fill={inFavorites ? 'currentColor' : 'none'} />
                {inFavorites ? 'Favorited' : 'Favorite'}
              </button>
            </div>

            {rewatchPanel && (
              <div className="flex items-center gap-2 flex-wrap bg-zinc-800/60 border border-white/5 rounded-xl px-4 py-3">
                <span className="text-zinc-400 text-xs w-full mb-1">Rewatch — optionally pick a date range, or leave empty to use each episode's release date:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    value={rewatchStart}
                    max={rewatchEnd || todayStr()}
                    onChange={(e) => setRewatchStart(e.target.value)}
                    placeholder="Start"
                    className="bg-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg border border-white/5 focus:border-brand/50 focus:outline-none"
                  />
                  <span className="text-zinc-600 text-xs">→</span>
                  <input
                    type="date"
                    value={rewatchEnd}
                    min={rewatchStart}
                    max={todayStr()}
                    onChange={(e) => setRewatchEnd(e.target.value)}
                    placeholder="End"
                    className="bg-zinc-700 text-white text-xs px-2.5 py-1.5 rounded-lg border border-white/5 focus:border-brand/50 focus:outline-none"
                  />
                  <button
                    onClick={confirmRewatchShow}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-black text-xs font-medium transition"
                  >
                    <Check size={12} /> Confirm
                  </button>
                  <button onClick={() => setRewatchPanel(false)} className="p-1.5 rounded-lg bg-zinc-700 text-white transition">
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}

            {watchedCount > 0 && (
              <div className="flex items-center gap-3 bg-zinc-800/60 border border-white/5 rounded-xl px-4 py-2.5 w-fit text-sm">
                <span className="text-zinc-400">{watchedCount} / {totalEps} episodes</span>
                <div className="w-28 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full" style={{ width: `${Math.min(100, (watchedCount / totalEps) * 100)}%` }} />
                </div>
                <span className="text-brand font-medium">{Math.round((watchedCount / totalEps) * 100)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Seasons */}
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-zinc-300 uppercase tracking-widest">Seasons</h2>
          {detail.seasons.filter((s) => s.season_number > 0).map((season) => {
            const open = openSeason === season.season_number;
            const eps = episodes[season.season_number] ?? [];
            const watchedInSeason = eps.filter((e) => hasWatchedEpisode(showId, season.season_number, e.episode_number)).length;
            const allWatched = eps.length > 0 && watchedInSeason === eps.length;

            return (
              <div key={season.id} className="bg-zinc-800/60 border border-white/5 rounded-xl overflow-hidden">
                <button
                  onClick={() => loadSeason(season.season_number)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/5 transition text-left"
                >
                  <span className="text-white font-medium">{season.name}</span>
                  <div className="flex items-center gap-3 text-sm text-zinc-400">
                    {watchedInSeason > 0 && (
                      <span className="text-brand text-xs font-medium">{watchedInSeason}/{season.episode_count}</span>
                    )}
                    <span className="text-xs">{season.episode_count} ep</span>
                    {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </div>
                </button>

                {open && eps.length > 0 && (
                  <div className="border-t border-white/5">
                    <div className="px-4 py-2 flex justify-end border-b border-white/5">
                      <button
                        onClick={() => markSeasonAll(season.season_number, eps, !allWatched)}
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-brand transition"
                      >
                        <CheckCheck size={13} /> {allWatched ? 'Unmark all' : 'Mark all watched'}
                      </button>
                    </div>
                    {eps.map((ep) => (
                      <EpisodeRow
                        key={ep.id}
                        ep={ep}
                        showId={showId}
                        seasonNumber={season.season_number}
                        watched={hasWatchedEpisode(showId, season.season_number, ep.episode_number)}
                        watchedAt={episodeWatchedAt(season.season_number, ep.episode_number)}
                        rewatchDates={episodeRewatchDates(season.season_number, ep.episode_number)}
                        onLog={(sn, en, date) => logEpisodeAndCheck(sn, en, date)}
                        onUnlog={(sn, en) => unlogEpisode(showId, sn, en)}
                        onRewatch={(sn, en, date) => logEpisodeRewatch(showId, sn, en, date)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type TrackedShowStatus = 'watching' | 'completed' | 'paused' | 'dropped';
