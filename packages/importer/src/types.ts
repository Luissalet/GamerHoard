// Normalized shapes the importer produces from a TV Time GDPR export.
// TV Time IDs: shows/episodes/characters = TheTVDB integers; movies in the modern
// services carry only a TV Time UUID + a title (no external id) -> resolved by title.

export type FollowState = 'watching' | 'stopped' | 'archived';

export interface NormFollow {
  tvdbShowId: number | null;
  name: string;
  state: FollowState;
  isForLater: boolean;
  isArchived: boolean;
  followedAt: string | null;
}

export interface NormWatch {
  kind: 'episode' | 'movie';
  tvdbShowId: number | null;   // TheTVDB series id (also present for "unitary" movies)
  tvdbEpId: number | null;     // TheTVDB episode id
  season: number | null;
  number: number | null;
  isSpecial: boolean;
  rewatchCount: number;
  runtimeMin: number | null;
  seriesName: string | null;
  movieName: string | null;
  watchedAt: string | null;
}

export interface NormReaction {
  kind: 'rating' | 'emotion';
  entityUuid: string | null;
  value: number;               // rating bucket, or emotion id (trailing int of vote_key)
  seriesName: string | null;
  movieName: string | null;
  season: number | null;
  number: number | null;
}

export interface NormComment {
  entityType: 'show' | 'episode' | 'movie';
  entityUuid: string | null;
  body: string;
  isSpoiler: boolean;
  lang: string | null;
  likeCount: number;
  createdAt: string | null;
  seriesName: string | null;
  movieName: string | null;
}

export interface NormListItem {
  type: 'series' | 'movie';
  tvdb: number | null;   // TheTVDB id for series items
  uuid: string | null;   // TV Time UUID for movie items
}
export interface NormList {
  sKey: string;                 // TV Time list key ("favorite-series", "favorite-movies", or a uuid)
  name: string;
  description: string | null;
  isPublic: boolean;
  items: NormListItem[];
}

export interface NormMovie {
  title: string; slug: string | null; year: number | null; watchedAt: string | null; runtimeSec: number | null; uuid: string | null; releaseDate: string | null;
}

export interface NormProfile {
  handle: string | null;
  locale: string;
  timezone: string | null;
  darkMode: boolean | null;
  follows: NormFollow[];
  watches: NormWatch[];
  reactions: NormReaction[];
  characterVotes: number;
  comments: NormComment[];
  lists: NormList[];              // custom user lists (favorites excluded — see favoriteShows/Movies)
  favoriteShows: number[];        // TheTVDB ids from the "favorite-series" list
  favoriteMovies: string[];       // TV Time UUIDs from the "favorite-movies" list
  movies: NormMovie[];
  badges: string[];
  friends: number;
  settings: Record<string, string>;
  episodesSeenByShow: Record<number, number>;
}
