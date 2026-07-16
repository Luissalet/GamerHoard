export interface Profile {
  handle: string | null; series_clock: string | null; episodes: number; movies_clock: string | null;
  movies: number; shows_added: number; following: number; lists: number; badges: number; reactions: number; comments: number; character_votes: number;
}
export interface ShowRow {
  // NOTE: GamerHoard tracks GAMES. The shows/tvdb_id/watched_episodes names are inherited
  // from Watch Hoard and kept to minimise churn: a "show" is a game, an "episode" is a
  // DLC/expansion, and network holds the studio/publisher.
  tvdb_id: number; title: string; state: string; is_favorite: number;
  watched_episodes: number; last_season: number | null; last_episode: number | null; last_watched_at: string | null;
  poster: string | null; tmdb_status: string | null; total_episodes: number | null; network: string | null; last_aired_season: number | null; last_aired_episode: number | null; next_air_date: string | null; next_season: number | null; next_episode: number | null; na_checked: number;
  genres?: string | null;
  /** JSON array of platform slugs the user OWNS this game on. */
  owned_platforms?: string | null;
  /** JSON array of platform slugs the game is AVAILABLE on (cached from RAWG). */
  platforms?: string | null;
  /** Playtime in minutes (from a Steam import), if any. */
  playtime_minutes?: number | null;
  /** Steam appid (set when the game was imported from Steam). */
  steam_appid?: number | null;
  /** The user's own rating, 1-10 (shown as 5 stars with halves). */
  user_rating?: number | null;
  /** Free-form personal notes about the game. */
  notes?: string | null;
}
export interface RecentRow { id: number; kind: string; title: string; season: number | null; episode: number | null; watched_at: string | null; poster?: string | null; show_tvdb?: number | null; movie_uuid?: string | null; }
export interface MovieRow { uuid: string | null; title: string; slug: string | null; year: number | null; watched_at: string | null; poster: string | null; release_date: string | null; is_favorite: number; genres?: string | null; rewatch_count?: number | null; tmdb_id?: number | null; }
export interface ReviewRow { id: number; text: string; entity_type: string | null; title: string | null; is_spoiler: number; like_count: number; created_at: string | null; }
export interface BadgeRow { id: number; key: string | null; label: string; grp: string | null; show_tvdb: number | null; }
export interface ListRow { id: number; name: string; is_public: number; item_count: number; }
export interface ListItemRow { kind: 'series' | 'movie'; tvdb_id: number | null; uuid: string | null; title: string; poster: string | null; year: number | null; watched_at: string | null; last_watched_at: string | null; }

export interface AddShow { tvdb_id: number; title: string; poster: string | null; tmdb_status: string | null; total_episodes: number | null; network: string | null; last_aired_season: number | null; last_aired_episode: number | null; /** Initial state; games default to 'backlog' (Pendiente). */ state?: string; }
export interface AddMovie { uuid: string; title: string; slug: string | null; year: number | null; poster: string | null; release_date: string | null; }
export interface SteamGame { tvdb_id: number; title: string; poster: string | null; steam_appid: number; playtime_minutes: number; state: string; owned_platforms: string | null; }

// Backend-agnostic contract. LocalSource (SQLite) and MemorySource (web) implement it now;
// a SupabaseSource implements the same shape later — screens depend only on this interface.
export interface DataSource {
  ready(): Promise<void>;
  clearData(): Promise<void>;
  reimport(): Promise<void>;
  /** Replace ALL user data with a freshly parsed TV Time export (in-app importer). */
  importData(seed: unknown): Promise<void>;
  getProfile(): Promise<Profile | null>;
  getContinueWatching(limit?: number): Promise<ShowRow[]>;
  getShows(): Promise<ShowRow[]>;
  getMovies(limit?: number): Promise<MovieRow[]>;
  getUpcomingMovies(): Promise<MovieRow[]>;
  getMovieByUuid(uuid: string): Promise<MovieRow | null>;
  getReviews(limit?: number): Promise<ReviewRow[]>;
  getBadges(): Promise<BadgeRow[]>;
  getShowById(tvdbId: number): Promise<ShowRow | null>;
  getFavorites(limit?: number): Promise<ShowRow[]>;
  getFavoriteMovies(limit?: number): Promise<MovieRow[]>;
  getRecent(limit?: number): Promise<RecentRow[]>;
  getLists(): Promise<ListRow[]>;
  getListById(listId: number): Promise<ListRow | null>;
  getListItems(listId: number): Promise<ListItemRow[]>;
  createList(name: string, isPublic?: boolean): Promise<number | null>;
  renameList(listId: number, name: string): Promise<void>;
  deleteList(listId: number): Promise<void>;
  addToList(listId: number, item: { kind: 'series' | 'movie'; tvdb?: number | null; uuid?: string | null }): Promise<void>;
  removeFromList(listId: number, item: { kind: 'series' | 'movie'; tvdb?: number | null; uuid?: string | null }): Promise<void>;
  /** Append a watch event to the user's history (single marks; bulk season-marks log one row).
   *  Pass tvdb (episodes) / uuid (movies) so history links don't depend on title matching. */
  logRecent(e: { kind: 'episode' | 'movie'; title: string; season?: number | null; episode?: number | null; poster?: string | null; tvdb?: number | null; uuid?: string | null }): Promise<void>;
  setShowState(tvdbId: number, state: 'backlog' | 'watching' | 'stopped' | 'archived'): Promise<void>;
  /** "I watched it again": bumps rewatch_count and refreshes watched_at. */
  rewatchMovie(uuid: string): Promise<void>;
  /** +1 on an already-watched episode ("lo he vuelto a ver"). No-op if the episode isn't marked. */
  rewatchEpisode(tvdbShow: number, season: number, episode: number): Promise<void>;
  /** Episodes of a show with rewatch_count > 0 (regular seasons only). */
  getEpisodeRewatches(tvdbShow: number): Promise<{ season: number; episode: number; rewatch_count: number }[]>;
  /** Refresh a show's TMDB metadata (drives categories + progress bars). */
  setShowMeta(tvdbId: number, m: { tmdb_status: string | null; total_episodes: number | null; network: string | null; last_aired_season: number | null; last_aired_episode: number | null }): Promise<void>;
  setShowFavorite(tvdbId: number, favorite: boolean): Promise<void>;
  setMovieFavorite(uuid: string, favorite: boolean): Promise<void>;
  markWatched(tvdbId: number): Promise<void>;
  setProgress(tvdbId: number, lastSeason: number, lastEpisode: number, watchedEpisodes: number): Promise<void>;
  getWatchedEpisodes(tvdbShow: number): Promise<{ season: number; episode: number }[]>;
  seedEpState(tvdbShow: number, eps: { season: number; episode: number }[]): Promise<void>;
  setEpisodeWatched(tvdbShow: number, season: number, episode: number, watched: boolean): Promise<void>;
  addShow(p: AddShow): Promise<void>;
  setShowNextAir(tvdbId: number, date: string | null, season: number | null, episode: number | null): Promise<void>;
  addMovie(p: AddMovie): Promise<void>;
  setMovieWatched(p: AddMovie, watched: boolean): Promise<void>;
  setMovieReleaseDate(uuid: string, releaseDate: string | null): Promise<void>;
  getUncheckedPendientes(): Promise<MovieRow[]>;
  markMovieChecked(uuid: string): Promise<void>;
  setMoviePoster(uuid: string, poster: string | null): Promise<void>;
  /** Cache the resolved TMDB id on a library movie (skips future title searches). */
  setMovieTmdbId(uuid: string, tmdbId: number | null): Promise<void>;
  setShowPoster(tvdbId: number, poster: string | null): Promise<void>;
  setShowGenres(tvdbId: number, genres: string | null): Promise<void>;
  /** Persist which platforms the user owns this game on (JSON array of slugs, or null). */
  setOwnedPlatforms(tvdbId: number, ownedJson: string | null): Promise<void>;
  /** Cache the platforms a game is available on (JSON array of slugs, or null). */
  setPlatforms(tvdbId: number, platformsJson: string | null): Promise<void>;
  /** Insert or update a game imported from Steam (playtime, appid, PC platform). */
  addSteamGame(p: SteamGame): Promise<void>;
  /** The user's own 1-10 rating for a game (null clears it). */
  setShowRating(tvdbId: number, rating: number | null): Promise<void>;
  /** Free-form personal notes on a game (null/'' clears them). */
  setShowNotes(tvdbId: number, notes: string | null): Promise<void>;
  setMovieGenres(uuid: string, genres: string | null): Promise<void>;
  isShowInLibrary(tvdbId: number): Promise<boolean>;
  isMovieInLibrary(uuid: string): Promise<boolean>;
  removeShow(tvdbId: number): Promise<void>;
  removeMovie(uuid: string): Promise<void>;
}
