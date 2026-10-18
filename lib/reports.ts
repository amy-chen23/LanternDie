import type { ImagePickerAsset } from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const bucket = 'report-photos';
const maxBytes = 5 * 1024 * 1024;
const fields = 'id, user_id, created_at, photo_path, observed_on, place_name, caption, visibility, upvotes, downvotes, flagged_inaccurate';

export type Visibility = 'private' | 'public';
export type ReportDetails = { observed_on: string; place_name: string; caption: string; visibility: Visibility };
export type Report = {
  id: string; user_id: string; created_at: string; photo_path: string; photo_url: string | null;
  observed_on: string; place_name: string | null; caption: string | null; visibility: Visibility;
  upvotes: number; downvotes: number; flagged_inaccurate: boolean; author_name: string;
  my_vote: -1 | 0 | 1; my_flag: boolean;
};

function cleanDetails(details: ReportDetails) {
  const date = details.observed_on.trim();
  const parsed = new Date(`${date}T00:00:00Z`);
  const today = new Date();
  const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > todayLocal) {
    throw new Error('Enter a valid observation date on or before today (YYYY-MM-DD).');
  }
  const place = details.place_name.trim();
  const caption = details.caption.trim();
  if (place.length > 100) throw new Error('Keep the location under 100 characters.');
  if (caption.length > 280) throw new Error('Keep the caption under 280 characters.');
  if (details.visibility !== 'private' && details.visibility !== 'public') throw new Error('Choose a visibility setting.');
  return { observed_on: date, place_name: place || null, caption: caption || null, visibility: details.visibility };
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && reader.result.includes(',')
      ? resolve(`data:image/jpeg;base64,${reader.result.split(',')[1]}`)
      : reject(new Error('Could not read photo.'));
    reader.onerror = () => reject(new Error('Could not read photo.'));
    reader.readAsDataURL(blob);
  });
}

async function loadPhoto(path: string): Promise<string | null> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  return readAsDataUrl(data);
}

async function decorateReports(rows: any[], viewerId: string): Promise<Report[]> {
  if (!supabase || !rows.length) return [];
  const reportIds = rows.map(row => row.id as string);
  const authorIds = [...new Set(rows.map(row => row.user_id as string))];
  const [names, votes, flags] = await Promise.all([
    supabase.from('community_profiles').select('user_id, display_name').in('user_id', authorIds),
    supabase.from('report_votes').select('report_id, value').eq('voter_id', viewerId).in('report_id', reportIds),
    supabase.from('report_flags').select('report_id').eq('flagger_id', viewerId).in('report_id', reportIds),
  ]);
  if (names.error) throw names.error;
  if (votes.error) throw votes.error;
  if (flags.error) throw flags.error;
  const nameById = new Map((names.data ?? []).map(row => [row.user_id, row.display_name]));
  const voteById = new Map((votes.data ?? []).map(row => [row.report_id, row.value]));
  const flagIds = new Set((flags.data ?? []).map(row => row.report_id));
  return Promise.all(rows.map(async row => ({
    ...row, photo_url: await loadPhoto(row.photo_path),
    author_name: nameById.get(row.user_id) ?? 'Field member',
    my_vote: (voteById.get(row.id) ?? 0) as -1 | 0 | 1,
    my_flag: flagIds.has(row.id),
  })));
}

export async function loadReports(userId: string): Promise<Report[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('reports').select(fields)
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return decorateReports(data ?? [], userId);
}

export async function loadPublicReports(viewerId: string): Promise<Report[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('reports').select(fields)
    .eq('visibility', 'public').order('created_at', { ascending: false }).limit(25);
  if (error) throw error;
  return decorateReports(data ?? [], viewerId);
}

export async function loadReportEngagement(reportId: string): Promise<Pick<Report, 'upvotes' | 'downvotes' | 'flagged_inaccurate'>> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('reports')
    .select('upvotes, downvotes, flagged_inaccurate').eq('id', reportId).single();
  if (error) throw error;
  return data;
}

export async function submitReport(userId: string, asset: ImagePickerAsset, details: ReportDetails): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const cleaned = cleanDetails(details);
  const longestEdge = Math.max(asset.width, asset.height);
  const actions: ImageManipulator.Action[] = longestEdge > 1600
    ? [{ resize: asset.width >= asset.height ? { width: 1600 } : { height: 1600 } }]
    : [];
  const image = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    base64: true, compress: 0.75, format: ImageManipulator.SaveFormat.JPEG,
  });
  if (!image.base64) throw new Error('Could not prepare the selected photo.');
  const bytes = decode(image.base64);
  if (bytes.byteLength > maxBytes) throw new Error('This photo is over 5 MB after resizing. Please choose a smaller image.');
  const path = `${userId}/${Crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: 'image/jpeg', cacheControl: '0', upsert: false,
  });
  if (uploadError) throw uploadError;
  const { error: reportError } = await supabase.from('reports').insert({ user_id: userId, photo_path: path, ...cleaned });
  if (reportError) {
    await supabase.storage.from(bucket).remove([path]);
    throw reportError;
  }
}

export async function updateReportDetails(reportId: string, details: ReportDetails): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('reports').update(cleanDetails(details)).eq('id', reportId);
  if (error) throw error;
}

export async function setReportVote(reportId: string, viewerId: string, value: -1 | 0 | 1): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: existing, error: readError } = await supabase.from('report_votes').select('value')
    .eq('report_id', reportId).eq('voter_id', viewerId).maybeSingle();
  if (readError) throw readError;
  const result = value === 0
    ? await supabase.from('report_votes').delete().eq('report_id', reportId).eq('voter_id', viewerId)
    : existing
      ? await supabase.from('report_votes').update({ value }).eq('report_id', reportId).eq('voter_id', viewerId)
      : await supabase.from('report_votes').insert({ report_id: reportId, voter_id: viewerId, value });
  if (result.error) throw result.error;
}

export async function setReportFlag(reportId: string, viewerId: string, flagged: boolean): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const result = flagged
    ? await supabase.from('report_flags').insert({ report_id: reportId, flagger_id: viewerId })
    : await supabase.from('report_flags').delete().eq('report_id', reportId).eq('flagger_id', viewerId);
  if (result.error) throw result.error;
}
