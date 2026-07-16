// Moderation & safety client (cloud only): user blocks, content reports, staff actions,
// account deletion. Backed by 0012_moderation.sql — every write goes through a
// SECURITY DEFINER RPC so the client can never spoof snapshots or skip checks.
import { supabase } from './lib/supabase';
import type { UserResult } from './social';

export type ReportReason = 'spam' | 'harassment' | 'hate' | 'sexual' | 'violence' | 'impersonation' | 'other';
export const REPORT_REASONS: ReportReason[] = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'impersonation', 'other'];
export type ReportTargetType = 'user' | 'review' | 'activity';
export type ReportStatus = 'pending' | 'actioned' | 'dismissed';
export type ModAction = 'dismiss' | 'delete_content' | 'ban' | 'delete_and_ban';

// ============================ BLOCKS ============================
let blockedCache: Set<string> | null = null;
export function invalidateBlockCache(): void { blockedCache = null; }

// Ids of the people YOU blocked (being blocked is never directly visible; RLS handles that side).
export async function getBlockedIds(): Promise<Set<string>> {
  if (blockedCache) return blockedCache;
  const { data, error } = await supabase.from('user_blocks').select('blocked_id');
  if (error) return blockedCache ?? new Set();
  blockedCache = new Set((data ?? []).map((r: any) => r.blocked_id as string));
  return blockedCache;
}

export async function isBlockedByMe(targetId: string): Promise<boolean> {
  return (await getBlockedIds()).has(targetId);
}

export async function blockUser(targetId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('block_user', { target: targetId });
  if (!error) invalidateBlockCache();
  return error ? { error: error.message } : {};
}

export async function unblockUser(targetId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('unblock_user', { target: targetId });
  if (!error) invalidateBlockCache();
  return error ? { error: error.message } : {};
}

export async function getBlockedUsers(): Promise<UserResult[]> {
  const { data } = await supabase.from('user_blocks').select('blocked_id').order('created_at', { ascending: false }).limit(500);
  const ids = (data ?? []).map((r: any) => r.blocked_id as string);
  if (!ids.length) return [];
  const { data: profs } = await supabase.from('profiles').select('id,handle,display_name,avatar_url,bio').in('id', ids);
  const map: Record<string, UserResult> = {};
  for (const p of (profs ?? []) as UserResult[]) map[p.id] = p;
  return ids.map((id) => map[id]).filter(Boolean);
}

// ============================ REPORTS ============================
export async function submitReport(p: {
  targetType: ReportTargetType;
  targetProfileId: string;
  targetReviewId?: string | null;
  reason: ReportReason;
  details?: string;
}): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('submit_report', {
    p_target_type: p.targetType,
    p_target_profile: p.targetProfileId,
    p_target_review: p.targetReviewId ?? null,
    p_reason: p.reason,
    p_details: p.details ?? null,
  });
  return error ? { error: error.message } : {};
}

// ============================ STAFF ============================
export type ModReport = {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_profile_id: string;
  target_review_id: string | null;
  reason: ReportReason;
  details: string | null;
  content_snapshot: string | null;
  status: ReportStatus;
  created_at: string;
  reviewed_at: string | null;
  resolution: string | null;
  reporter: { handle: string } | null;
  target: { handle: string; banned_until: string | null } | null;
};

export async function getReports(status: ReportStatus): Promise<ModReport[]> {
  const { data } = await supabase.from('reports').select('*')
    .eq('status', status).order('created_at', { ascending: false }).limit(200);
  const rows = (data ?? []) as any[];
  const ids = [...new Set(rows.flatMap((r) => [r.reporter_id, r.target_profile_id]))];
  const profs: Record<string, any> = {};
  if (ids.length) {
    const { data: ps } = await supabase.from('profiles').select('id,handle,banned_until').in('id', ids);
    for (const p of (ps ?? []) as any[]) profs[p.id] = p;
  }
  return rows.map((r) => ({
    ...r,
    reporter: profs[r.reporter_id] ? { handle: profs[r.reporter_id].handle } : null,
    target: profs[r.target_profile_id]
      ? { handle: profs[r.target_profile_id].handle, banned_until: profs[r.target_profile_id].banned_until ?? null }
      : null,
  }));
}

export async function resolveReport(reportId: string, action: ModAction, banDays?: number | null, note?: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('mod_resolve_report', {
    p_report: reportId, p_action: action, p_ban_days: banDays ?? null, p_note: note ?? null,
  });
  return error ? { error: error.message } : {};
}

// days: null = permanent, 0 = unban.
export async function setBan(userId: string, days: number | null): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('mod_set_ban', { p_user: userId, p_days: days });
  return error ? { error: error.message } : {};
}

// ============================ BANS / ACCOUNT ============================
// profiles.banned_until: null = fine, 'infinity' = permanent, else ISO date.
export function banInfo(bannedUntil: string | null | undefined): { active: boolean; permanent: boolean; until: Date | null } {
  if (!bannedUntil) return { active: false, permanent: false, until: null };
  if (bannedUntil === 'infinity') return { active: true, permanent: true, until: null };
  const d = new Date(bannedUntil);
  if (isNaN(d.getTime())) return { active: true, permanent: true, until: null };
  return { active: d.getTime() > Date.now(), permanent: false, until: d };
}

// Permanently deletes the auth user; the whole library/social footprint cascades in the DB.
export async function deleteAccount(): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('delete_account');
  return error ? { error: error.message } : {};
}
