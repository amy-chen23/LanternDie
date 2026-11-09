import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { canScoreLocally, scoreLanternflies } from './death-runtime';
import policy from '../assets/models/policy.json';
import type { Identification } from './identification';

export type DeathAssessment = {
  report_id: string; detector_updated_at: string; model_sha256: string;
  status: 'complete' | 'unavailable' | 'failed'; scores: number[]; threshold: number;
  proposed_dead: boolean; route: 'community_verification'; updated_at: string;
};
export type VerificationLabel = 'alive' | 'dead' | 'uncertain';
export type VerificationVote = {
  report_id: string; detector_updated_at: string; detection_index: number; label: VerificationLabel;
};

function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(new Uint8Array(decode(reader.result.split(',')[1]))) : reject(new Error('photo_unavailable'));
    reader.onerror = () => reject(new Error('photo_unavailable'));
    reader.readAsDataURL(blob);
  });
}

const inFlight = new Map<string, Promise<void>>();
export function assessReportLocally(reportId: string): Promise<void> {
  const existing = inFlight.get(reportId);
  if (existing) return existing;
  const task = assess(reportId).finally(() => inFlight.delete(reportId));
  inFlight.set(reportId, task);
  return task;
}

async function assess(reportId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to assess a report.');
  const [report, identification] = await Promise.all([
    supabase.from('reports').select('photo_path').eq('id', reportId).eq('user_id', user.id).maybeSingle(),
    supabase.from('report_identifications').select('*').eq('report_id', reportId).maybeSingle(),
  ]);
  if (report.error || identification.error || !report.data) throw new Error('Could not load saved report.');
  const gate = identification.data as Identification | null;
  if (!gate || gate.status !== 'detected' || !gate.detections.length) return;
  const previous = await supabase.from('report_death_assessments').select('status')
    .eq('report_id', reportId).eq('detector_updated_at', gate.updated_at).eq('model_sha256', policy.modelSha256).maybeSingle();
  if (previous.error) throw new Error('Could not load alive/dead assessment.');
  if (previous.data?.status === 'complete') return;
  let scores: number[] = [];
  let status = 'complete', errorCode: string | null = null;
  try {
    if (!canScoreLocally()) throw new Error('native_build_required');
    if (!gate.image_width || !gate.image_height) throw new Error('invalid_gate_dimensions');
    const { data: photo, error } = await supabase.storage.from('report-photos').download(report.data.photo_path);
    if (error || !photo || photo.size > 5 * 1024 * 1024) throw new Error('photo_unavailable');
    scores = await scoreLanternflies(await blobBytes(photo), gate.image_width, gate.image_height, gate.detections);
  } catch (cause) {
    errorCode = cause instanceof Error && cause.message === 'native_build_required' ? 'native_build_required' : 'inference_failed';
    status = errorCode === 'native_build_required' ? 'unavailable' : 'failed';
  }
  // The server validates ownership, gate snapshot, model, and score count, and
  // always stores community routing. Device scores cannot award verification.
  const { error } = await supabase.rpc('save_death_assessment', {
    p_report_id: reportId, p_detector_updated_at: gate.updated_at,
    p_model_sha256: policy.modelSha256, p_status: status, p_scores: scores, p_error_code: errorCode,
  });
  if (error) throw new Error('Report saved, but the alive/dead result could not be saved. Retry the assessment.');
}

export async function setVerificationVote(reportId: string, detectorUpdatedAt: string, index: number, label: VerificationLabel | null) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('set_verification_vote', {
    p_report_id: reportId, p_detector_updated_at: detectorUpdatedAt, p_detection_index: index, p_label: label,
  });
  if (error) throw new Error('Could not save verification vote. Refresh and try again.');
}
