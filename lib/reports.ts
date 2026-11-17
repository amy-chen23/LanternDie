import type { ImagePickerAsset } from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { loadProfilePhotos } from './profile-photo';
import { supabase } from './supabase';
import { communityFeedStatuses } from './community-feed';
import { loadReportPhotoUrls } from './report-photo-urls';
import type { ProcessingStatus, WorkflowStatus } from './report-processing';
import type { Identification } from './identification';

const bucket = 'report-photos';
const maxBytes = 5 * 1024 * 1024;
const fields = 'id, user_id, created_at, photo_path, observed_on, place_name, caption, visibility, upvotes, downvotes, workflow_status, insects_ready';

export type Visibility = 'private' | 'public';
export type ReportDetails = { observed_on: string; place_name: string; caption: string };
export type ReportInsect = { id: string; report_id: string; box: { x: number; y: number; width: number; height: number }; revision: number; label: 'pending' | 'alive' | 'dead' };
export type Report = {
  id: string; user_id: string; created_at: string; photo_path: string; photo_url: string | null;
  photo_url_expires_at?: number;
  observed_on: string; place_name: string | null; caption: string | null; visibility: Visibility;
  upvotes: number; downvotes: number; author_name: string; author_photo_url: string | null;
  my_vote: -1 | 0 | 1;
  workflow_status: WorkflowStatus;
  insects_ready: boolean;
  processing: ProcessingStatus | null;
  insects: ReportInsect[];
  verified_kills: number;
  identification: Identification | null;
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
  return { observed_on: date, place_name: place || null, caption: caption || null };
}

async function decorateReports(rows: any[], viewerId: string, previous: Report[] = []): Promise<Report[]> {
  if (!supabase || !rows.length) return [];
  const reportIds = rows.map(row => row.id as string);
  const authorIds = [...new Set(rows.map(row => row.user_id as string))];
  const [names, votes, identifications, processing, insects, credits, authorPhotos, photos] = await Promise.all([
    supabase.from('community_profiles').select('user_id, display_name').in('user_id', authorIds),
    supabase.from('report_votes').select('report_id, value').eq('voter_id', viewerId).in('report_id', reportIds),
    supabase.from('report_identifications')
      .select('report_id, status, model_id, confidence_threshold, image_width, image_height, detections, error_message, updated_at')
      .in('report_id', reportIds),
    supabase.from('report_processing_jobs')
      .select('report_id,status,attempts,available_at,last_error_code,updated_at').in('report_id', reportIds),
    supabase.from('report_insects').select('id,report_id,box,revision,label').in('report_id', reportIds).eq('active', true).order('id'),
    supabase.from('report_kill_credits').select('report_id,dead_insects').in('report_id', reportIds),
    loadProfilePhotos(authorIds),
    loadReportPhotoUrls(supabase.storage.from(bucket), rows.map(row => row.photo_path), previous),
  ]);
  if (names.error) throw names.error;
  if (votes.error) throw votes.error;
  if (identifications.error) throw identifications.error;
  if (processing.error) throw processing.error;
  if (insects.error) throw insects.error;
  if (credits.error) throw credits.error;
  const identificationById = new Map((identifications.data ?? []).map(row => [row.report_id, row as Identification]));
  const nameById = new Map((names.data ?? []).map(row => [row.user_id, row.display_name]));
  const voteById = new Map((votes.data ?? []).map(row => [row.report_id, row.value]));
  return rows.map(row => ({
    ...row, photo_url: photos.get(row.photo_path)?.url ?? null,
    photo_url_expires_at: photos.get(row.photo_path)?.expiresAt,
    author_name: nameById.get(row.user_id) ?? 'Field member',
    author_photo_url: authorPhotos.get(row.user_id) ?? null,
    my_vote: (voteById.get(row.id) ?? 0) as -1 | 0 | 1,
    insects: (insects.data ?? []).filter(insect => insect.report_id === row.id) as ReportInsect[],
    verified_kills: credits.data?.find(credit => credit.report_id === row.id)?.dead_insects ?? 0,
    processing: (processing.data ?? []).find(job => job.report_id === row.id) as ProcessingStatus | undefined ?? null,
    identification: identificationById.get(row.id) ?? null,
  }));
}

export async function loadReports(userId: string, previous: Report[] = []): Promise<Report[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('reports').select(fields)
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return decorateReports(data ?? [], userId, previous);
}

export async function loadPublicReports(viewerId: string, authorId?: string): Promise<Report[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  let query = supabase.from('reports').select(fields)
    .eq('visibility', 'public').in('workflow_status', [...communityFeedStatuses]);
  if (authorId) query = query.eq('user_id', authorId);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(25);
  if (error) throw error;
  return decorateReports(data ?? [], viewerId);
}

export async function loadVerificationReports(viewerId: string): Promise<Report[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('report_verification_queue').select(fields)
    .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(25);
  if (error) throw error;
  return decorateReports(data ?? [], viewerId);
}

export async function loadAdminReports(viewerId: string, all = false, reportId?: string): Promise<Report[]> {
  if (!supabase) throw new Error('Sign in required.');
  // Every query still goes through report/storage RLS; the app also rechecks role.
  let request = supabase.from(all || reportId ? 'reports' : 'report_admin_queue').select(fields);
  if (reportId) request = request.eq('id', reportId);
  const { data, error } = await request.order('created_at', { ascending: !all }).order('id', { ascending: true }).limit(reportId ? 1 : 10);
  if (error) throw error;
  return decorateReports(data ?? [], viewerId);
}

export async function loadReportEngagement(reportId: string): Promise<Pick<Report, 'upvotes' | 'downvotes'>> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('reports')
    .select('upvotes, downvotes').eq('id', reportId).single();
  if (error) throw error;
  return data;
}

export async function submitReport(userId: string, asset: ImagePickerAsset, details: ReportDetails): Promise<string> {
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
  const { data: report, error: reportError } = await supabase.from('reports')
    .insert({ user_id: userId, photo_path: path, ...cleaned }).select('id').single();
  if (reportError) {
    await supabase.storage.from(bucket).remove([path]);
    throw reportError;
  }
  return report.id;
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
