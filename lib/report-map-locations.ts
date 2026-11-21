import { supabase } from './supabase';
import { parseCommunityMapLocations } from './community-map-locations';
import type { CommunityMapLocation } from './community-map-locations';

export async function loadCommunityMapLocations(): Promise<CommunityMapLocation[]> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase.from('report_map_locations')
    .select('latitude, longitude')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return parseCommunityMapLocations(data);
}
