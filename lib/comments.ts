import { supabase } from './supabase';

type CommentRow = { id: string; report_id: string; author_id: string; body: string; created_at: string };
export type PostComment = CommentRow & { author_name: string };
const fields = 'id,report_id,author_id,body,created_at';
const pageSize = 20;

export function cleanComment(body: string): string {
  const text = body.trim();
  if (!text) throw new Error('Write a comment before posting.');
  if (text.length > 1000) throw new Error('Keep your comment to 1,000 characters.');
  return text;
}

async function withNames(rows: CommentRow[]): Promise<PostComment[]> {
  if (!supabase) throw new Error('Sign in to view comments.');
  if (!rows.length) return [];
  const { data, error } = await supabase.from('community_profiles').select('user_id,display_name')
    .in('user_id', [...new Set(rows.map(row => row.author_id))]);
  if (error) throw error;
  const names = new Map((data ?? []).map(row => [row.user_id, row.display_name]));
  return rows.map(row => ({ ...row, author_name: names.get(row.author_id) ?? 'Field member' }));
}

export async function loadComments(reportId: string, before?: PostComment): Promise<{ comments: PostComment[]; hasMore: boolean }> {
  if (!supabase) throw new Error('Sign in to view comments.');
  let query = supabase.from('report_comments').select(fields).eq('report_id', reportId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize + 1);
  if (before) query = query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);
  const { data, error } = await query;
  if (error) throw error;
  return { comments: await withNames((data ?? []).slice(0, pageSize)), hasMore: (data?.length ?? 0) > pageSize };
}

export async function addComment(reportId: string, userId: string, body: string, id: string): Promise<PostComment> {
  if (!supabase) throw new Error('Sign in to comment.');
  const text = cleanComment(body);
  const { data, error } = await supabase.from('report_comments')
    .insert({ id, report_id: reportId, author_id: userId, body: text }).select(fields).single();
  if (error && error.code !== '23505') throw error;
  let row: CommentRow | null = data;
  if (error) {
    // Reuse the draft ID after an uncertain network result instead of duplicating it.
    const existing = await supabase.from('report_comments').select(fields).eq('id', id).single();
    if (existing.error) throw existing.error;
    row = existing.data;
    if (row.report_id !== reportId || row.author_id !== userId || row.body !== text) throw new Error('Please refresh before posting.');
  }
  if (!row) throw new Error('Could not read the saved comment.');
  return (await withNames([row]))[0];
}

export async function deleteComment(id: string): Promise<void> {
  if (!supabase) throw new Error('Sign in to delete a comment.');
  const { data, error } = await supabase.from('report_comments').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('This comment is no longer available.');
}
