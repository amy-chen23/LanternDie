import { supabase } from './supabase';
import type { Box } from './moderation-geometry';
export type AdminInsect = {
  id: string; revision: number; box: Box; active: boolean; label: 'pending' | 'alive' | 'dead';
  source: 'admin' | 'community' | 'model' | null; reason: string | null; model_score: number | null;
  alive_votes: number; dead_votes: number; uncertain_votes: number;
};
export type AuditEvent = {
  id: string | number; actor_id: string | null; action: string; created_at: string;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
};
export type ModerationSnapshot = {
  report_id: string; status: string; published_at: string | null; insects_ready: boolean;
  photo_width: number | null; photo_height: number | null; photo_registered: boolean;
  kill_credits: number; version: string; insects: AdminInsect[]; audit: AuditEvent[];
};
export type ModerationAction = {
  action: 'box_save' | 'box_remove' | 'decide_alive' | 'decide_dead' | 'reject' | 'publish';
  insect?: AdminInsect; box?: Box; imageWidth?: number; imageHeight?: number; description: string;
};
function rpcError(message?: string) {
  if (message?.includes('Admin required')) return new Error('Admin access is no longer available.');
  if (message?.includes('changed')) return new Error('This report changed. Refresh it and review your action again.');
  if (message?.includes('Box') || message?.includes('box') || message?.includes('dimensions')) return new Error('Use a valid box inside the saved photo. Refresh if the photo or box changed.');
  if (message?.includes('Hash registration')) return new Error('Publication requires completed photo checks and a final decision for every active insect.');
  if (message?.includes('Reason')) return new Error('Enter a reason of 1–1000 characters.');
  return new Error('Moderation could not finish. Refresh this report before trying again.');
}
export async function loadModeration(reportId: string): Promise<ModerationSnapshot> {
  if (!supabase) throw new Error('Sign in required.');
  const { data, error } = await supabase.rpc('admin_get_report_moderation', { p_report_id: reportId });
  if (error || !data) throw rpcError(error?.message);
  return data as ModerationSnapshot;
}
export async function moderateReport(snapshot: ModerationSnapshot, proposal: ModerationAction, reason: string): Promise<ModerationSnapshot> {
  if (!supabase) throw new Error('Sign in required.');
  const { data, error } = await supabase.rpc('admin_moderate_report', {
    p_report_id: snapshot.report_id, p_version: snapshot.version, p_action: proposal.action, p_reason: reason.trim(),
    p_insect_id: proposal.insect?.id ?? null, p_revision: proposal.insect?.revision ?? null,
    p_box: proposal.box ?? null, p_image_width: proposal.imageWidth ?? null, p_image_height: proposal.imageHeight ?? null,
  });
  if (error || !data) throw rpcError(error?.message);
  return data as ModerationSnapshot;
}
