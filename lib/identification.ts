import { supabase } from './supabase';
import type { Detection } from '../supabase/functions/identify-report/detection';

export type Identification = {
  report_id: string;
  status: 'processing' | 'detected' | 'not_detected' | 'failed';
  model_id: string | null;
  confidence_threshold: number | null;
  image_width: number | null;
  image_height: number | null;
  detections: Detection[];
  error_message: string | null;
  updated_at: string;
};

export async function identifyReport(reportId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('retry_report_processing', { p_report_id: reportId });
  if (error) throw new Error('Retry unavailable. Wait 15 minutes after a technical failure; checks already running will retry automatically.');
}
