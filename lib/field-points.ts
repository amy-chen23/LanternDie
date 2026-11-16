import { supabase } from './supabase';

export async function loadFieldPoints(userId: string): Promise<number> {
  if (!supabase) throw new Error('Sign in to load field points.');
  const { data, error } = await supabase.rpc('get_profile_field_points', { profile_user_id: userId });
  if (error) throw error;
  const points = Number(data);
  if (data == null || !Number.isSafeInteger(points)) throw new Error('Invalid field points total.');
  return points;
}
