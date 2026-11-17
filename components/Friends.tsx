import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../lib/typography';
import { acceptFriendRequest, loadFriends, loadFriendship, removeFriendRequest, sendFriendRequest,
  type FriendEntry, type Friendship, type MemberIdentity } from '../lib/friends';

type Action = 'send' | 'accept' | 'remove';
function FriendButtons({ relationship, userId, busy, onAction }: {
  relationship: Friendship | null; userId: string; busy: boolean; onAction: (action: Action) => void;
}) {
  const button = (label: string, action: Action) => <Pressable key={label} accessibilityRole="button"
    accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => onAction(action)}
    style={({ pressed }) => [styles.button, (pressed || busy) && styles.dim]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
  return <View style={styles.actions}>
    {!relationship ? button('Add friend', 'send') : relationship.status === 'accepted' ? <>
      <Text style={styles.copy}>Friends</Text>{button('Remove friend', 'remove')}
    </> : relationship.requester_id === userId ? <>
      <Text style={styles.copy}>Request sent</Text>{button('Cancel request', 'remove')}
    </> : <>{button('Accept request', 'accept')}{button('Decline request', 'remove')}</>}
    {busy ? <ActivityIndicator accessibilityLabel="Updating friendship" color="#F72D33" /> : null}
  </View>;
}

async function applyAction(action: Action, relationship: Friendship | null, userId: string, otherId: string) {
  if (action === 'send') await sendFriendRequest(userId, otherId);
  else if (relationship && action === 'accept') await acceptFriendRequest(relationship.id);
  else if (relationship) await removeFriendRequest(relationship.id);
}

export function FriendRequestButton({ userId, otherId }: { userId: string; otherId: string }) {
  const [relationship, setRelationship] = useState<Friendship | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const locked = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    loadFriendship(userId, otherId).then(value => {
      if (generation.current === request) setRelationship(value);
    }).catch(() => {
      if (generation.current === request) setError('Could not load friendship status. Try again.');
    }).finally(() => { if (generation.current === request) setLoading(false); });
    return () => { generation.current++; };
  }, [userId, otherId, attempt]);

  async function act(action: Action) {
    if (locked.current) return;
    locked.current = true;
    const request = generation.current;
    setBusy(true);
    setError('');
    try {
      await applyAction(action, relationship, userId, otherId);
      const next = await loadFriendship(userId, otherId);
      if (generation.current === request) setRelationship(next);
    } catch {
      if (generation.current === request) setError('Could not update friendship. Retry to check its latest status.');
    } finally {
      locked.current = false;
      if (generation.current === request) setBusy(false);
    }
  }
  if (userId === otherId) return null;
  return <View style={styles.section}>
    {loading ? <ActivityIndicator accessibilityLabel="Loading friendship status" color="#F72D33" />
      : !error ? <FriendButtons relationship={relationship} userId={userId} busy={busy} onAction={action => void act(action)} /> : null}
    {error ? <>
      <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => setAttempt(value => value + 1)} style={styles.button}>
        <Text style={styles.buttonText}>Retry friendship status</Text>
      </Pressable>
    </> : null}
  </View>;
}

export function FriendsPanel({ userId, onOpenProfile }: {
  userId: string | null; onOpenProfile: (member: MemberIdentity) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const locked = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    setRows([]);
    setError('');
    if (!open || !userId) return;
    setLoading(true);
    loadFriends(userId).then(value => {
      if (generation.current === request) setRows(value);
    }).catch(() => {
      if (generation.current === request) setError('Could not load friends and requests. Try refreshing.');
    }).finally(() => { if (generation.current === request) setLoading(false); });
    return () => { generation.current++; };
  }, [open, userId, attempt]);

  async function act(row: FriendEntry, action: Action) {
    if (!userId || locked.current) return;
    locked.current = true;
    const request = generation.current;
    setBusy(true);
    setError('');
    try {
      await applyAction(action, row, userId, row.member.user_id);
      const next = await loadFriends(userId);
      if (generation.current === request) setRows(next);
    } catch {
      if (generation.current === request) setError('Could not update this request. Refresh to check its latest status.');
    } finally {
      locked.current = false;
      if (generation.current === request) setBusy(false);
    }
  }

  function group(title: string, entries: FriendEntry[], empty: string) {
    return <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {!entries.length ? <Text style={styles.copy}>{empty}</Text> : entries.map(row => <View key={row.id} style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${row.member.author_name}'s profile`}
          onPress={() => onOpenProfile(row.member)} style={styles.identity}>
          {row.member.author_photo_url ? <Image source={{ uri: row.member.author_photo_url }} style={styles.avatar} /> : null}
          <Text style={styles.name}>{row.member.author_name}</Text>
        </Pressable>
        <FriendButtons relationship={row} userId={userId!} busy={busy} onAction={action => void act(row, action)} />
      </View>)}
    </View>;
  }
  return <View style={styles.section}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open, disabled: busy }} disabled={busy}
      onPress={() => setOpen(value => !value)} style={styles.button}>
      <Text style={styles.buttonText}>{open ? 'Hide friends & requests' : 'Friends & requests'}</Text>
    </Pressable>
    {open && !userId ? <Text style={styles.copy}>Sign in to add friends and receive requests.</Text> : null}
    {open && userId ? <>
      <Pressable accessibilityRole="button" disabled={loading || busy} onPress={() => setAttempt(value => value + 1)} style={styles.button}>
        <Text style={styles.buttonText}>Refresh friends & requests</Text>
      </Pressable>
      {loading ? <ActivityIndicator accessibilityLabel="Loading friends and requests" color="#F72D33" /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {!loading && !error ? <>
        {group('Incoming requests', rows.filter(row => row.status === 'pending' && row.recipient_id === userId), 'No incoming requests.')}
        {group('Friends', rows.filter(row => row.status === 'accepted'), 'No friends yet. Visit a member profile to send a request.')}
        {group('Sent requests', rows.filter(row => row.status === 'pending' && row.requester_id === userId), 'No sent requests.')}
      </> : null}
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12, marginVertical: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 10, alignSelf: 'flex-start', backgroundColor: '#FFFFFF' },
  buttonText: { color: '#F72D33', fontSize: 14, fontWeight: '700' },
  dim: { opacity: 0.5 },
  heading: { color: '#111111', fontSize: 18, fontWeight: '700' },
  copy: { color: '#696969', fontSize: 14 },
  error: { color: '#F72D33', fontSize: 14 },
  card: { gap: 12, padding: 14, backgroundColor: '#FFFFFF', borderRadius: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  name: { color: '#111111', fontSize: 16, fontWeight: '700', flexShrink: 1 },
});
