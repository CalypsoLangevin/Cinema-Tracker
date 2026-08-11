import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Eye, Bookmark, BookmarkCheck, Heart, Star, Clock, Check, X } from 'lucide-react';
import { tmdb, posterUrl, backdropUrl } from '../lib/tmdb';
import { useStore } from '../store';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const movieId = Number(id);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof tmdb.movie>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickingDate, setPickingDate] = useState(false);
  const [watchDate, setWatchDate] = useState(todayStr());

  const { movies, logMovie, removeMovieWatch, isInWatchlist, addToWatchlist, removeFromWatchlist, isInFavorites, addToFavorites, removeFromFavorites } = useStore();
  const tracked = movies[movieId];
  const inList = isInWatchlist(movieId, 'movie');
  const inFavorites = isInFavorites(movieId, 'movie');

  useEffect(() => {
    tmdb.movie(movieId).then(setDetail).finally(() => setLoading(false));
  }, [movieId]);

  if (loading) return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-64 bg-zinc-800 rounded-xl" />
      <div className="h-6 bg-zinc-800 rounded w-1/2" />
      <div className="h-4 bg-zinc-800 rounded w-full" />
    </div>
  );
  if (!detail) return <div className="text-zinc-400 p-8">Not found</div>;

  const poster = posterUrl(detail.poster_path, 'w500');
  const backdrop = backdropUrl(detail.backdrop_path);

  const confirmWatch = () => {
    logMovie(
      { id: detail.id, title: detail.title, poster_path: detail.poster_path, release_date: detail.release_date, runtime: detail.runtime, watchCount: 0, lastWatched: '' },
      new Date(watchDate).toISOString()
    );
    setPickingDate(false);
    setWatchDate(todayStr());
  };

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

      <div className="max-w-6xl mx-auto px-4 -mt-24 sm:-mt-32 relative z-10 pb-8">
        <div className="flex flex-col sm:flex-row gap-5 sm:gap-8">
          {/* Poster */}
          <div className="w-28 sm:w-44 shrink-0 mx-auto sm:mx-0 shadow-2xl rounded-xl overflow-hidden ring-2 ring-white/5">
            {poster
              ? <img src={poster} alt={detail.title} className="w-full" />
              : <div className="aspect-[2/3] bg-zinc-700" />
            }
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4 pt-0 sm:pt-16">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-center sm:text-left">{detail.title}</h1>
              <div className="flex items-center justify-center sm:justify-start gap-4 mt-2 text-zinc-400 text-sm flex-wrap">
                <span>{detail.release_date?.slice(0, 4)}</span>
                {detail.runtime && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {detail.runtime} min
                  </span>
                )}
                <span className="flex items-center gap-1 text-brand">
                  <Star size={12} fill="currentColor" /> {detail.vote_average.toFixed(1)}
                </span>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap justify-center sm:justify-start">
                {detail.genres.map((g) => (
                  <span key={g.id} className="bg-zinc-800 border border-white/5 text-zinc-300 text-xs px-2.5 py-0.5 rounded-full">{g.name}</span>
                ))}
              </div>
            </div>

            <p className="text-zinc-400 text-sm leading-relaxed max-w-2xl">{detail.overview}</p>

            {/* Watch controls */}
            <div className="flex items-center gap-3 flex-wrap">
              {tracked && tracked.watchCount > 0 ? (
                <div className="flex items-center gap-1 bg-zinc-800 border border-white/5 rounded-xl p-1">
                  <button
                    onClick={() => removeMovieWatch(movieId)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xl font-light transition"
                    title="Remove one watch"
                  >−</button>
                  <span className="text-brand font-bold px-3 min-w-[3rem] text-center">{tracked.watchCount}×</span>
                  <button
                    onClick={() => setPickingDate(true)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-brand hover:bg-brand text-black text-xl font-light transition"
                    title="Add one watch"
                  >+</button>
                </div>
              ) : (
                <button
                  onClick={() => setPickingDate(true)}
                  className="flex items-center gap-2 bg-brand hover:bg-brand text-black px-5 py-2.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-brand/20"
                >
                  <Eye size={15} /> Mark as Watched
                </button>
              )}
              <button
                onClick={() => inList ? removeFromWatchlist(movieId, 'movie') : addToWatchlist(movieId, 'movie')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                  inList
                    ? 'bg-brand/10 border-brand/30 text-brand'
                    : 'bg-zinc-800 border-white/5 text-zinc-300 hover:text-white hover:bg-zinc-700'
                }`}
              >
                {inList ? <><BookmarkCheck size={15} /> In Watchlist</> : <><Bookmark size={15} /> Watchlist</>}
              </button>
              <button
                onClick={() => inFavorites ? removeFromFavorites(movieId, 'movie') : addToFavorites(movieId, 'movie')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                  inFavorites
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-zinc-800 border-white/5 text-zinc-300 hover:text-white hover:bg-zinc-700'
                }`}
              >
                <Heart size={15} fill={inFavorites ? 'currentColor' : 'none'} />
                {inFavorites ? 'Favorited' : 'Favorite'}
              </button>
            </div>

            {/* Date picker */}
            {pickingDate && (
              <div className="flex items-center gap-3 bg-zinc-800 border border-white/5 rounded-xl px-4 py-3 w-fit flex-wrap">
                <span className="text-zinc-400 text-sm">Watched on</span>
                <input
                  type="date"
                  value={watchDate}
                  max={todayStr()}
                  onChange={(e) => setWatchDate(e.target.value)}
                  className="bg-zinc-700 text-white text-sm px-3 py-1.5 rounded-lg border border-white/5 focus:border-brand/50 focus:outline-none"
                />
                {detail?.release_date && (
                  <button
                    onClick={() => setWatchDate(detail.release_date!.slice(0, 10))}
                    className="text-sm px-2.5 py-1.5 rounded-lg bg-zinc-700 text-zinc-400 hover:text-white transition"
                  >
                    Release date
                  </button>
                )}
                <button onClick={confirmWatch} className="p-2 rounded-lg bg-brand hover:bg-brand text-black transition" title="Confirm">
                  <Check size={14} />
                </button>
                <button onClick={() => setPickingDate(false)} className="p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition" title="Cancel">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Watch stats */}
            {tracked && tracked.watchCount > 0 && (
              <div className="bg-zinc-800/60 border border-white/5 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  {detail.runtime && (
                    <span className="text-zinc-500 text-sm">{Math.round(tracked.watchCount * detail.runtime / 60)}h total</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(tracked.watchDates ?? [tracked.lastWatched]).map((d, i) => (
                    <span key={i} className="bg-zinc-700 text-zinc-200 text-xs px-2.5 py-1 rounded-full">
                      {new Date(d).toLocaleDateString()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
