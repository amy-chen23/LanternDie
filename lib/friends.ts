import { supabase } from './supabase';
import { loadProfilePhotos } from './profile-photo';

export type MemberIdentity = { user_id: string; author_name: string; author_photo_url: string | null };
export type Friendship = {
  id: string; requester_id: string; recipient_id: string; status: 'pending' | 'accepted';
};
export type FriendEntry = Friendship & { member: MemberIdentity };

export async function loadFriendship(userId: string, otherId: string): Promise<Friendship | null> {
  if (!supabase) throw new Error('Sign in required.');
  // RLS returns only the viewer's relationships; filter both participants explicitly.
  const { data, error } = await supabase.from('friend_requests').select('id,requester_id,recipient_id,status')
    .or(`and(requester_id.eq.${userId},recipient_id.eq.${otherId}),and(requester_id.eq.${otherId},recipient_id.eq.${userId})`).maybeSingle();
  if (error) throw error;
  return data as Friendship | null;
}

export async function loadFriends(userId: string): Promise<FriendEntry[]> {
  if (!supabase) throw new Error('Sign in required.');
  const { data, error } = await supabase.from('friend_requests').select('id,requester_id,recipient_id,status')
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`).order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Friendship[];
  const ids = rows.map(row => row.requester_id === userId ? row.recipient_id : row.requester_id);
  if (!ids.length) return [];
  const [names, photos] = await Promise.all([
    supabase.from('community_profiles').select('user_id,display_name').in('user_id', ids),
    loadProfilePhotos(ids),
  ]);
  if (names.error) throw names.error;
  const nameById = new Map((names.data ?? []).map(row => [row.user_id, row.display_name]));
  return rows.map(row => {
    const id = row.requester_id === userId ? row.recipient_id : row.requester_id;
    return { ...row, member: { user_id: id, author_name: nameById.get(id) ?? 'Field member', author_photo_url: photos.get(id) ?? null } };
  });
}

export async function sendFriendRequest(userId: string, recipientId: string): Promise<void> {
  if (!supabase) throw new Error('Sign in required.');
  if (userId === recipientId) throw new Error('You cannot send yourself a friend request.');
  const { error } = await supabase.from('friend_requests').insert({ requester_id: userId, recipient_id: recipientId });
  // A simultaneous/repeated or reverse-direction request is already represented.
  if (error && error.code !== '23505') throw error;
}

export async function acceptFriendRequest(requestId: string): Promise<void> {
  if (!supabase) throw new Error('Sign in required.');
  const { error } = await supabase.rpc('accept_friend_request', { request_id: requestId });
  if (error) throw error;
}

export async function removeFriendRequest(requestId: string): Promise<void> {
  if (!supabase) throw new Error('Sign in required.');
  const { error } = await supabase.from('friend_requests').delete().eq('id', requestId);
  if (error) throw error;
}
