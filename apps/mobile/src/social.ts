import { supabase } from './lib/supabase';
import i18n from './i18n';
import { getBlockedIds } from './moderation';

// The social identity people search for. Reads of public.profiles are governed by RLS
// ("profiles read public": is_public OR own), so only public profiles (plus yourself) return.
export type UserResult = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

// Keep only chars safe inside a PostgREST or()/ilike filter (letters, numbers, space, _).
function sanitize(q: string): string {
  return q.trim().replace(/[^\p{L}\p{N}_ ]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export async function searchUsers(query: string): Promise<UserResult[]> {
  const term = sanitize(query);
  if (term.length < 1) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id,handle,display_name,avatar_url,bio')
    .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`)
    .order('handle')
    .limit(25);
  if (error) return [];
  // People you blocked don't show up in search (their content is already RLS-hidden).
  const blocked = await getBlockedIds().catch(() => new Set<string>());
  return ((data as UserResult[]) ?? []).filter((u) => !blocked.has(u.id));
}

export type PublicProfile = UserResult & { banner_url: string | null; is_public: boolean; created_at: string };

export async function getProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const h = handle.trim().toLowerCase();
  if (!h) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id,handle,display_name,avatar_url,banner_url,bio,is_public,created_at')
    .eq('handle', h)
    .maybeSingle();
  return (data as PublicProfile) ?? null;
}

// ============================ FOLLOW GRAPH ============================
export type FollowStatus = 'none' | 'pending' | 'accepted';

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function profilesByIds(ids: string[]): Promise<Record<string, UserResult>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return {};
  const { data } = await supabase.from('profiles').select('id,handle,display_name,avatar_url,bio').in('id', uniq);
  const map: Record<string, UserResult> = {};
  for (const p of (data ?? []) as UserResult[]) map[p.id] = p;
  return map;
}

export async function getFollowState(targetId: string): Promise<FollowStatus> {
  const me = await uid();
  if (!me) return 'none';
  const { data } = await supabase.from('user_follows').select('status').eq('follower_id', me).eq('following_id', targetId).maybeSingle();
  return ((data?.status as FollowStatus) ?? 'none');
}

export async function getFollowCounts(targetId: string): Promise<{ followers: number; following: number }> {
  const { data } = await supabase.rpc('follow_counts', { target: targetId });
  const row: any = Array.isArray(data) ? data[0] : data;
  return { followers: row?.followers ?? 0, following: row?.following ?? 0 };
}

export async function followUser(targetId: string): Promise<FollowStatus> {
  const { data, error } = await supabase.rpc('follow_user', { target: targetId });
  if (error) return 'none';
  return ((data as FollowStatus) ?? 'none');
}

export async function unfollowUser(targetId: string): Promise<void> {
  await supabase.rpc('unfollow_user', { target: targetId });
}

export async function respondFollowRequest(followerId: string, accept: boolean): Promise<void> {
  await supabase.rpc('respond_follow_request', { follower: followerId, accept });
}

export async function getFollowers(targetId: string): Promise<UserResult[]> {
  const { data } = await supabase.from('user_follows').select('follower_id').eq('following_id', targetId).eq('status', 'accepted').limit(200);
  const ids = (data ?? []).map((r: any) => r.follower_id as string);
  const m = await profilesByIds(ids);
  return ids.map((id) => m[id]).filter(Boolean);
}

export async function getFollowing(targetId: string): Promise<UserResult[]> {
  const { data } = await supabase.from('user_follows').select('following_id').eq('follower_id', targetId).eq('status', 'accepted').limit(200);
  const ids = (data ?? []).map((r: any) => r.following_id as string);
  const m = await profilesByIds(ids);
  return ids.map((id) => m[id]).filter(Boolean);
}

export async function getPendingRequests(): Promise<UserResult[]> {
  const me = await uid();
  if (!me) return [];
  const { data } = await supabase.from('user_follows').select('follower_id').eq('following_id', me).eq('status', 'pending').limit(200);
  const ids = (data ?? []).map((r: any) => r.follower_id as string);
  const m = await profilesByIds(ids);
  return ids.map((id) => m[id]).filter(Boolean);
}

// ============================ REVIEWS ============================
export type EntityKind = 'show' | 'movie' | 'episode';
export type ReviewAuthor = { handle: string; display_name: string | null; avatar_url: string | null };
export type Review = {
  id: string;
  author_id: string;
  rating: number | null;
  body: string | null;
  contains_spoiler: boolean;
  like_count: number;
  created_at: string;
  author: ReviewAuthor;
};

const REVIEW_COLS = 'id,author_id,rating,body,contains_spoiler,like_count,created_at';

export async function getReviewsForEntity(kind: EntityKind, key: string): Promise<Review[]> {
  const { data } = await supabase.from('content_reviews').select(REVIEW_COLS)
    .eq('entity_type', kind).eq('entity_key', key)
    .order('created_at', { ascending: false }).limit(200);
  const rows = (data ?? []) as any[];
  const authors = await profilesByIds(rows.map((r) => r.author_id));
  return rows.map((r) => ({
    ...r,
    author: authors[r.author_id]
      ? { handle: authors[r.author_id].handle, display_name: authors[r.author_id].display_name, avatar_url: authors[r.author_id].avatar_url }
      : { handle: i18n.t('feed.userFallback'), display_name: null, avatar_url: null },
  }));
}

export async function getMyReview(kind: EntityKind, key: string): Promise<Review | null> {
  const me = await uid();
  if (!me) return null;
  const { data } = await supabase.from('content_reviews').select(REVIEW_COLS)
    .eq('author_id', me).eq('entity_type', kind).eq('entity_key', key).maybeSingle();
  if (!data) return null;
  return { ...(data as any), author: { handle: '', display_name: null, avatar_url: null } };
}

export async function upsertReview(kind: EntityKind, key: string, rating: number | null, body: string | null, spoiler: boolean): Promise<{ error?: string }> {
  const me = await uid();
  if (!me) return { error: i18n.t('reviews.errNoSession') };
  const text = body?.trim() || null;
  if (rating == null && !text) return { error: i18n.t('reviews.errRatingOrText') };
  const { error } = await supabase.from('content_reviews').upsert({
    author_id: me, entity_type: kind, entity_key: key, rating, body: text, contains_spoiler: spoiler, updated_at: new Date().toISOString(),
  }, { onConflict: 'author_id,entity_type,entity_key' });
  return error ? { error: error.message } : {};
}

export async function deleteReview(id: string): Promise<void> {
  await supabase.from('content_reviews').delete().eq('id', id);
}

export type AuthoredReview = { id: string; entity_type: EntityKind; entity_key: string; rating: number | null; body: string | null; contains_spoiler: boolean; like_count: number; created_at: string };
// A user's recent reviews. RLS (0005) already hides them if the author is private and
// you're not an accepted follower — so this doubles as the privacy gate for profile content.
export async function getReviewsByAuthor(authorId: string, limit = 20): Promise<AuthoredReview[]> {
  const { data } = await supabase.from('content_reviews')
    .select('id,entity_type,entity_key,rating,body,contains_spoiler,like_count,created_at')
    .eq('author_id', authorId).order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as AuthoredReview[];
}

export function ratingSummary(reviews: Review[]): { avg: number | null; count: number } {
  const rated = reviews.filter((r) => r.rating != null);
  if (!rated.length) return { avg: null, count: 0 };
  return { avg: rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length, count: rated.length };
}

export async function getMyLikedReviewIds(reviewIds: string[]): Promise<Set<string>> {
  const me = await uid();
  if (!me || !reviewIds.length) return new Set();
  const { data } = await supabase.from('review_likes').select('review_id').eq('profile_id', me).in('review_id', reviewIds);
  return new Set((data ?? []).map((r: any) => r.review_id as string));
}

export async function toggleReviewLike(reviewId: string, currentlyLiked: boolean): Promise<void> {
  const me = await uid();
  if (!me) return;
  if (currentlyLiked) await supabase.from('review_likes').delete().eq('review_id', reviewId).eq('profile_id', me);
  else await supabase.from('review_likes').insert({ review_id: reviewId, profile_id: me });
}

// ============================ ACTIVITY FEED ============================
// Cloud-only. Events are written by the screens at meaningful moments (mark watched,
// review, follow) and read by the Discover "Friends" tab. RLS (0007) gates visibility
// to the actor's accepted followers (or everyone if the actor is public).
export type ActivityVerb = 'watched_episode' | 'watched_movie' | 'added_show' | 'added_movie' | 'reviewed' | 'followed';
export type ActivityEvent = {
  id: string;
  actor_id: string;
  verb: ActivityVerb;
  entity_type: 'show' | 'movie' | 'episode' | 'user' | null;
  entity_key: string | null;
  title: string | null;
  poster: string | null;
  meta: Record<string, any>;
  created_at: string;
  actor: UserResult;
};

// Fire-and-forget: activity must never break or slow the main action.
export function logActivity(verb: ActivityVerb, e: { entityType?: 'show' | 'movie' | 'episode' | 'user'; entityKey?: string; title?: string; poster?: string | null; meta?: Record<string, any> }): void {
  (async () => {
    try {
      const me = await uid();
      if (!me) return;
      await supabase.from('activity_events').insert({
        actor_id: me, verb, entity_type: e.entityType ?? null, entity_key: e.entityKey ?? null,
        title: e.title ?? null, poster: e.poster ?? null, meta: e.meta ?? {},
      });
    } catch { /* ignore */ }
  })();
}

export async function getFriendsActivity(limit = 60): Promise<ActivityEvent[]> {
  const me = await uid();
  if (!me) return [];
  const { data: fl } = await supabase.from('user_follows').select('following_id').eq('follower_id', me).eq('status', 'accepted').limit(500);
  const ids = (fl ?? []).map((r: any) => r.following_id as string);
  if (!ids.length) return [];
  const { data } = await supabase.from('activity_events').select('*').in('actor_id', ids)
    .order('created_at', { ascending: false }).limit(limit);
  const rows = (data ?? []) as any[];
  const actors = await profilesByIds(rows.map((r) => r.actor_id));
  return rows.map((r) => ({
    ...r,
    meta: r.meta ?? {},
    actor: actors[r.actor_id] ?? { id: r.actor_id, handle: i18n.t('feed.userFallback'), display_name: null, avatar_url: null, bio: null },
  }));
}
