import type { SupabaseClient } from '@supabase/supabase-js';

// Delete the row first: storage only permits removal of orphan report photos.
export async function deleteOwnedReport(client: SupabaseClient, reportId: string, userId: string): Promise<boolean> {
  const { data, error } = await client.from('reports').delete()
    .eq('id', reportId).eq('user_id', userId).select('photo_path').single();
  if (error) throw new Error('Could not delete your submission. Refresh and try again.');
  if (!data) throw new Error('This submission is no longer available to delete.');

  // A storage failure must not make the already-deleted post appear to survive.
  try {
    const { error: photoError } = await client.storage.from('report-photos').remove([data.photo_path]);
    return !photoError;
  } catch {
    return false;
  }
}
