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
  const { data, error } = await supabase.functions.invoke('identify-report', { body: { report_id: reportId } });
  if (error || data?.error) {
    throw new Error('Your report is saved, but identification could not finish. Use Retry identification in Recent activity.');
  }
}
