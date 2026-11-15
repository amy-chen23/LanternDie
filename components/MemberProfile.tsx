import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../lib/typography';
import { loadPublicReports, type Report } from '../lib/reports';
import { loadProfilePhotos } from '../lib/profile-photo';
import { supabase } from '../lib/supabase';
import { PageHeader } from './PageHeader';

export function MemberProfile({ author, viewerId, onClose }: {
  author: Report; viewerId: string; onClose: () => void;
}) {
  const [profile, setProfile] = useState({ name: author.author_name, photo: author.author_photo_url });
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setReports([]);
    async function load() {
      if (!supabase) throw new Error('Sign in to view member profiles.');
      const [identity, photos, sightings] = await Promise.all([
        supabase.from('community_profiles').select('display_name').eq('user_id', author.user_id).maybeSingle(),
        loadProfilePhotos([author.user_id]),
        loadPublicReports(viewerId, author.user_id),
      ]);
      if (identity.error) throw identity.error;
      if (cancelled) return;
      // Do not retain identity or photos from a previously accessible report.
      if (!identity.data) throw new Error('This profile is no longer available.');
      setProfile({ name: identity.data.display_name, photo: photos.get(author.user_id) ?? null });
      setReports(sightings);
    }
    load().catch(() => {
      if (!cancelled) setError('Could not load this profile. It may no longer be available.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [author.user_id, viewerId, attempt]);

  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader label="MEMBER PROFILE" />
        <Pressable accessibilityRole="button" accessibilityLabel="Back to sightings" onPress={onClose} style={styles.button}>
          <Text style={styles.buttonText}>Back to sightings</Text>
        </Pressable>
        {loading ? <ActivityIndicator accessibilityLabel="Loading member profile" color="#F72D33" /> : error ? <View>
          <Text accessibilityRole="alert" style={styles.copy}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={styles.button}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View> : <>
          <View style={styles.identity}>
            {profile.photo && profile.photo !== failedPhoto ? <Image source={{ uri: profile.photo }} style={styles.avatar}
              accessibilityLabel={`${profile.name}'s profile photo`} onError={() => setFailedPhoto(profile.photo)} />
              : <View style={[styles.avatar, styles.fallback]}><Text style={styles.initial}>{profile.name.trim().slice(0, 1).toUpperCase() || '?'}</Text></View>}
            <Text style={styles.title}>{profile.name}</Text>
          </View>
          <Text style={styles.heading}>RECENT PUBLIC SIGHTINGS</Text>
          {!reports.length ? <Text style={styles.copy}>No public sightings to show.</Text> : null}
          {reports.map(report => <View key={report.id} style={styles.card}>
            {report.photo_url ? <Image source={{ uri: report.photo_url }} style={styles.photo} accessibilityLabel="Sighting photo" /> : null}
            <Text style={styles.copy}>Observed {report.observed_on}{report.place_name ? ` · ${report.place_name}` : ''}</Text>
            {report.caption ? <Text style={styles.copy}>{report.caption}</Text> : null}
            <Text style={styles.copy}>{report.upvotes} upvotes · {report.downvotes} downvotes</Text>
          </View>)}
        </>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 24, width: '100%', maxWidth: 680, alignSelf: 'center', gap: 16 },
  button: { paddingVertical: 12, alignSelf: 'flex-start' },
  buttonText: { color: '#F72D33', fontWeight: '700', fontSize: 16 },
  identity: { alignItems: 'center', gap: 16, paddingVertical: 20 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  fallback: { backgroundColor: '#FDE8E9', justifyContent: 'center', alignItems: 'center' },
  initial: { fontSize: 36, color: '#111111' },
  title: { fontSize: 28, fontWeight: '700', color: '#111111', textAlign: 'center' },
  heading: { fontSize: 13, fontWeight: '700', letterSpacing: 1.5, color: '#696969' },
  card: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, gap: 12 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8 },
  copy: { fontSize: 16, color: '#111111', lineHeight: 24 },
});
