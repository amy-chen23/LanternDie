import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../lib/typography';
import { loadPublicReports, loadReportEngagement, setReportVote, type Report } from '../lib/reports';
import { loadProfilePhotos } from '../lib/profile-photo';
import { supabase } from '../lib/supabase';
import { FieldPoints } from './FieldPoints';
import { FriendRequestButton } from './Friends';
import type { MemberIdentity } from '../lib/friends';
import { SightingBody, ReportVoteControls } from './SightingTile';
import { IdentificationResultsModal } from './ReportIdentification';

export function MemberProfile({ author, viewerId, onClose, backLabel = 'Back to sightings', onReportUpdated }: {
  author: MemberIdentity; viewerId: string; onClose: () => void; backLabel?: string;
  onReportUpdated?: (report: Report) => void;
}) {
  const [profile, setProfile] = useState({ name: author.author_name, photo: author.author_photo_url });
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const [feedWidth, setFeedWidth] = useState(0);
  const [resultsReport, setResultsReport] = useState<Report | null>(null);
  const [voteError, setVoteError] = useState('');
  const [voting, setVoting] = useState(false);
  const [pointsVersion, setPointsVersion] = useState(0);
  const voteLocked = useRef(false);
  const generation = useRef(0);
  const availableCardWidth = feedWidth >= 664 ? (feedWidth - 24) / 2 : feedWidth;
  const cardWidth = feedWidth >= 664 ? availableCardWidth : '100%';

  useEffect(() => {
    generation.current++;
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
    return () => { cancelled = true; generation.current++; };
  }, [author.user_id, viewerId, attempt]);

  async function vote(report: Report, value: -1 | 1) {
    if (voteLocked.current) return;
    voteLocked.current = true;
    const request = generation.current;
    const nextVote = report.my_vote === value ? 0 : value;
    const nextReport: Report = { ...report, my_vote: nextVote,
      upvotes: report.upvotes - Number(report.my_vote === 1) + Number(nextVote === 1),
      downvotes: report.downvotes - Number(report.my_vote === -1) + Number(nextVote === -1) };
    const show = (updated: Report) => {
      if (generation.current !== request) return;
      setReports(current => current.map(item => item.id === updated.id ? updated : item));
      onReportUpdated?.(updated);
    };
    setVoting(true);
    setVoteError('');
    show(nextReport);
    try {
      try {
        await setReportVote(report.id, viewerId, nextVote);
      } catch {
        show(report);
        if (generation.current === request) setVoteError('Could not save your vote. Please try again.');
        return;
      }
      if (generation.current === request) setPointsVersion(version => version + 1);
      try {
        const engagement = await loadReportEngagement(report.id);
        show({ ...nextReport, ...engagement });
      } catch {
        if (generation.current === request) setVoteError('Vote saved, but counts could not refresh. Reopen the profile to sync.');
      }
    } finally {
      voteLocked.current = false;
      if (generation.current === request) setVoting(false);
    }
  }

  const close = () => { if (!voteLocked.current) onClose(); };
  const currentResultsReport = reports.find(report => report.id === resultsReport?.id) ?? resultsReport;

  return <Modal visible animationType="slide" onRequestClose={close}>
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" accessibilityLabel={backLabel} disabled={voting} onPress={close} style={styles.button}>
          <Text style={styles.buttonText}>{backLabel}</Text>
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
          <FriendRequestButton key={`${viewerId}:${author.user_id}`} userId={viewerId} otherId={author.user_id} />
          <FieldPoints key={pointsVersion} userId={author.user_id} />
          <Text style={styles.heading}>RECENT PUBLIC SIGHTINGS</Text>
          {!reports.length ? <Text style={styles.copy}>No public sightings to show.</Text> : null}
          {voteError ? <Text accessibilityRole="alert" style={styles.voteError}>{voteError}</Text> : null}
          <View testID="profile-sightings-grid" onLayout={event => setFeedWidth(event.nativeEvent.layout.width)} style={styles.grid}>
            {reports.map(report => <View key={report.id} testID={`profile-sighting-${report.id}`} style={[styles.card, { width: cardWidth }]}>
              <View style={styles.authorRow}>
                <View style={styles.smallAvatar}>
                  {profile.photo && profile.photo !== failedPhoto ? <Image source={{ uri: profile.photo }} style={styles.smallAvatarImage}
                    onError={() => setFailedPhoto(profile.photo)} /> : <Text style={styles.smallInitial}>{profile.name.trim().slice(0, 1).toUpperCase() || '?'}</Text>}
                </View>
                <Text numberOfLines={1} style={styles.authorName}>{profile.name}</Text>
              </View>
              <SightingBody report={report} inlineVotes={availableCardWidth >= 316} onOpenPhoto={() => setResultsReport(report)}
                votes={<ReportVoteControls report={report} disabled={voting} onVote={(item, value) => void vote(item, value)} />} />
            </View>)}
          </View>
        </>}
      </ScrollView>
      <IdentificationResultsModal report={currentResultsReport} onClose={() => setResultsReport(null)} />
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { paddingHorizontal: 22, paddingVertical: 24, width: '100%', maxWidth: 1100, alignSelf: 'center', gap: 16 },
  button: { paddingVertical: 12, alignSelf: 'flex-start' },
  buttonText: { color: '#F72D33', fontWeight: '700', fontSize: 16 },
  identity: { alignItems: 'center', gap: 16, paddingVertical: 20 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  fallback: { backgroundColor: '#FDE8E9', justifyContent: 'center', alignItems: 'center' },
  initial: { fontSize: 36, color: '#111111' },
  title: { fontSize: 28, fontWeight: '700', color: '#111111', textAlign: 'center' },
  heading: { fontSize: 13, fontWeight: '700', letterSpacing: 1.5, color: '#696969' },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24 },
  card: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E2E2' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, minHeight: 44 },
  smallAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FDE8E9', alignItems: 'center', justifyContent: 'center' },
  smallAvatarImage: { width: 32, height: 32 },
  smallInitial: { color: '#F72D33', fontWeight: '700', fontSize: 12 },
  authorName: { color: '#111111', fontSize: 14, fontWeight: '700', flex: 1 },
  voteError: { color: '#F72D33', fontSize: 14 },
  copy: { fontSize: 16, color: '#111111', lineHeight: 24 },
});
