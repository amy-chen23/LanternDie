import { supabase } from './supabase';

export type LeaderboardPeriod = 'weekly' | 'monthly';
export type LeaderboardEntry = {
  name: string;
  initials: string;
  verifiedKills: number;
  avatarUrl: string | null;
};

function initialsFor(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase();
}

export async function loadLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardEntry[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('get_raw_upload_leaderboard', { p_period: period });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('The leaderboard response was invalid.');

  return data.map(row => {
    if (typeof row.display_name !== 'string' || typeof row.verified_kills !== 'number') {
      throw new Error('The leaderboard response contained an invalid ranking.');
    }
    return {
      name: row.display_name,
      initials: initialsFor(row.display_name),
      verifiedKills: row.verified_kills,
      avatarUrl: null,
    };
  });
}
