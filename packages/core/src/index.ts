// Shared domain types + helpers used by the app, importer, and (future) API.
export type FollowState = 'watching' | 'stopped' | 'archived';
export type TargetType = 'episode' | 'movie';
export type EntityType = 'show' | 'season' | 'episode' | 'movie';

export interface Show { id: string; tmdbId?: number; tvdbId?: number; imdbId?: string; title: string; status?: string; network?: string; posterPath?: string; }
export interface Episode { id: string; showId: string; seasonNumber: number; number: number; absNumber?: number; title?: string; airDate?: string; runtimeMin?: number; isSpecial?: boolean; }
export interface Movie { id: string; tmdbId?: number; title: string; releaseDate?: string; runtimeMin?: number; posterPath?: string; }
export interface Watch { id: string; profileId: string; targetType: TargetType; episodeId?: string; movieId?: string; rewatchIndex: number; watchedAt?: string; }

export const tmdbImage = (path?: string, size: 'w342' | 'w500' | 'original' = 'w500') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
