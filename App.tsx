import { memo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  Image,
  type ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TextInput, useAppFonts } from './lib/typography';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { Flag, House, Pencil, Search, RotateCw, Shield, Trophy, UserRound, UsersRound } from 'lucide-react-native';
import { loadReports, loadPublicReports, loadVerificationReports, loadReportEngagement, setReportFlag, setReportVote, submitReport, updateReportDetails, type Report, type ReportDetails } from './lib/reports';
import { loadProfilePhoto, saveProfilePhoto } from './lib/profile-photo';
import { loadLeaderboard, type LeaderboardEntry, type LeaderboardPeriod } from './lib/leaderboard';
import { supabase } from './lib/supabase';
import { reportProcessingMessage, hasPendingProcessing } from './lib/report-processing';
import { ReportIdentification, IdentificationResultsModal, identificationActionLabel } from './components/ReportIdentification';
import { CommunityReview } from './components/CommunityReview';
import { AdminAccess } from './components/AdminAccess';
import { useAdminRole } from './hooks/useAdminRole';

WebBrowser.maybeCompleteAuthSession();

const palette = {
  background: '#F5F5F5',
  paper: '#FFFFFF',
  ink: '#111111',
  muted: '#696969',
  red: '#F72D33',
  paleRed: '#FDE8E9',
  line: '#E2E2E2',
  black: '#111111',
  white: '#FFFFFF',
};

type Screen = 'home' | 'community' | 'leaderboard' | 'profile' | 'admin';
type AuthMode = 'sign-in' | 'sign-up';
const previewLeaderboardRankings: Record<LeaderboardPeriod, LeaderboardEntry[]> = {
  weekly: [
    { name: 'Maya Chen', initials: 'MC', verifiedKills: 12, avatarUrl: null },
    { name: 'Jordan Lee', initials: 'JL', verifiedKills: 9, avatarUrl: null },
    { name: 'Sam Rivera', initials: 'SR', verifiedKills: 7, avatarUrl: null },
  ],
  monthly: [
    { name: 'Jordan Lee', initials: 'JL', verifiedKills: 38, avatarUrl: null },
    { name: 'Maya Chen', initials: 'MC', verifiedKills: 31, avatarUrl: null },
    { name: 'Avery Patel', initials: 'AP', verifiedKills: 24, avatarUrl: null },
  ],
};

const badgeIcons: Record<string, ImageSourcePropType> = {
  'Weekly Top Killer': require('./assets/weekly-top-killer.png'),
  'Monthly Top Killer': require('./assets/monthly-top-killer.png'),
  'Local Star': require('./assets/local-star.png'),
  'Kill Streak': require('./assets/kill-streak.png'),
  'Best Streak': require('./assets/best-streak.png'),
};

function todayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function newReportDetails(): ReportDetails {
  return { observed_on: todayDate(), place_name: '', caption: '' };
}

function reportScore(report: Report): number {
  return report.upvotes - report.downvotes;
}

function getDisplayName(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Field member';
}

function displayNameError(value: string): string | null {
  const name = value.trim();
  if (name.length < 2 || name.length > 30) return 'Use 2 to 30 characters for your display name.';
  if (name.includes('@') || /[\r\n\t\x00-\x1f\x7f]/.test(name)) {
    return 'Do not use an email address or control characters in your display name.';
  }
  return null;
}

export default function App() {
  const [fontsLoaded, fontError] = useAppFonts();
  const [session, setSession] = useState<Session | null>(null);
  const adminRole = useAdminRole(session?.user.id);
  const [previewMode, setPreviewMode] = useState(false);
  const [loadingSession, setLoadingSession] = useState(Boolean(supabase));
  const [screen, setScreen] = useState<Screen>('home');
  const [photoAsset, setPhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [reportDetails, setReportDetails] = useState<ReportDetails>(newReportDetails);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [publicReports, setPublicReports] = useState<Report[]>([]);
  const [verificationReports, setVerificationReports] = useState<Report[]>([]);
  const [publicReportsViewerId, setPublicReportsViewerId] = useState<string | null>(null);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState('');
  const [communityBusyId, setCommunityBusyId] = useState<string | null>(null);
  const communityActionInFlight = useRef(false);
  const [reportsOwnerId, setReportsOwnerId] = useState<string | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [savingReport, setSavingReport] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profilePhotoOwnerId, setProfilePhotoOwnerId] = useState<string | null>(null);
  const [profilePhotoError, setProfilePhotoError] = useState('');
  const [savingProfilePhoto, setSavingProfilePhoto] = useState(false);
  const activeUserId = useRef<string | null>(null);
  activeUserId.current = session?.user.id ?? null;
  const visibleReports = reportsOwnerId === session?.user.id ? reports : [];
  const latestVisibleReports = useRef<Report[]>([]);
  latestVisibleReports.current = visibleReports;
  const visiblePublicReports = publicReportsViewerId === session?.user.id ? publicReports : [];
  const visibleProfilePhoto = profilePhotoOwnerId === session?.user.id ? profilePhotoUrl : null;
  const displayName = getDisplayName(session?.user.user_metadata?.display_name);
  const savedDisplayName = typeof session?.user.user_metadata?.display_name === 'string'
    ? session.user.user_metadata.display_name.trim() : '';

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setLoadingSession(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setReports([]);
    setReportsOwnerId(null);
    setReportError('');
  }, [session?.user.id]);

  useEffect(() => {
    setPublicReports([]);
    setVerificationReports([]);
    setPublicReportsViewerId(null);
    setCommunityError('');
  }, [session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;
    setProfilePhotoUrl(null);
    setProfilePhotoOwnerId(null);
    setProfilePhotoError('');
    if (!userId) return;

    loadProfilePhoto(userId)
      .then((url) => {
        if (activeUserId.current === userId) {
          setProfilePhotoUrl(url);
          setProfilePhotoOwnerId(userId);
        }
      })
      .catch((error) => {
        if (activeUserId.current === userId) {
          setProfilePhotoError(error instanceof Error ? error.message : 'Could not load your profile photo.');
        }
      });
  }, [session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !supabase) return;
    let alive = true;
    const resume = async () => {
      const { error } = await supabase!.rpc('touch_member_activity');
      if (alive && activeUserId.current === userId) {
        if (error) setReportError('Could not update activity. Refresh to retry.');
        await Promise.all([refreshReports(userId), refreshCommunity(userId)]);
      }
    };
    void resume();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void resume();
    });
    const heartbeat = setInterval(async () => {
      if (AppState.currentState === 'active') await supabase!.rpc('touch_member_activity');
    }, 5 * 60_000);
    return () => { alive = false; subscription.remove(); clearInterval(heartbeat); };
  }, [session?.user.id]);

  useEffect(() => {
    if (!adminRole.isAdmin) setScreen(current => current === 'admin' ? 'profile' : current);
  }, [adminRole.isAdmin]);

  const processingPending = hasPendingProcessing(visibleReports.map(report => report.processing));
  const reviewsPending = visibleReports.some(report => report.workflow_status === 'pending_review'
    || report.workflow_status === 'admin_review' || report.insects.some(insect => insect.label === 'pending'));
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || (!processingPending && !reviewsPending)) return;
    let refreshing = false;
    const timer = setInterval(async () => {
      if (refreshing || AppState.currentState !== 'active') return;
      refreshing = true;
      try { await refreshReports(userId, true); } finally { refreshing = false; }
    }, processingPending ? 10_000 : 30_000);
    return () => clearInterval(timer);
  }, [session?.user.id, processingPending, reviewsPending]);

  async function refreshReports(userId = session?.user.id, quiet = false) {
    if (!userId) return;
    if (!quiet) setReportsLoading(true);
    setReportError('');
    try {
      const nextReports = await loadReports(userId, quiet ? latestVisibleReports.current : []);
      if (activeUserId.current === userId) {
        setReports(nextReports);
        setReportsOwnerId(userId);
      }
    } catch (error) {
      if (activeUserId.current === userId) {
        setReportError(error instanceof Error ? error.message : 'Could not load your reports.');
      }
    } finally {
      if (!quiet && activeUserId.current === userId) setReportsLoading(false);
    }
  }

  async function refreshCommunity(userId = session?.user.id) {
    if (!userId) return;
    setCommunityLoading(true);
    setCommunityError('');
    try {
      const [next, reviewQueue] = await Promise.all([loadPublicReports(userId), loadVerificationReports(userId)]);
      if (activeUserId.current === userId) {
        setPublicReports(next);
        setVerificationReports(reviewQueue);
        setPublicReportsViewerId(userId);
      }
    } catch (error) {
      if (activeUserId.current === userId) setCommunityError(error instanceof Error ? error.message : 'Could not load community reports.');
    } finally {
      if (activeUserId.current === userId) setCommunityLoading(false);
    }
  }

  async function choosePhoto() {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo-library access to choose a lanternfly image.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });

    if (!result.canceled) setPhotoAsset(result.assets[0]);
  }

  async function saveReport() {
    if (!session || !photoAsset || savingReport) return;
    setSavingReport(true);
    setReportError('');
    try {
      const userId = session.user.id;
      await submitReport(userId, photoAsset, reportDetails);
      if (activeUserId.current === userId) {
        setPhotoAsset(null);
        setReportDetails(newReportDetails());
        // The database already enqueued detection. No inference runs on this device.
        void refreshReports(userId);
      }
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Could not save your report.');
    } finally {
      setSavingReport(false);
    }
  }

  function cancelReportUpload() {
    if (savingReport) return;
    setPhotoAsset(null);
    setReportDetails(newReportDetails());
    setReportError('');
  }

  async function saveEditedReport() {
    if (!session || !editingReportId || savingReport) return;
    setSavingReport(true);
    setReportError('');
    try {
      await updateReportDetails(editingReportId, reportDetails);
      setEditingReportId(null);
      setReportDetails(newReportDetails());
      await Promise.all([refreshReports(session.user.id), refreshCommunity(session.user.id)]);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Could not update report.');
    } finally {
      setSavingReport(false);
    }
  }

  async function changeVote(report: Report, value: -1 | 1) {
    if (!session || communityActionInFlight.current) return;
    communityActionInFlight.current = true;
    const userId = session.user.id;
    const nextVote = report.my_vote === value ? 0 : value;
    setCommunityBusyId(report.id);
    setCommunityError('');
    setPublicReports(current => current.map(item => item.id === report.id ? {
      ...item,
      upvotes: item.upvotes - Number(item.my_vote === 1) + Number(nextVote === 1),
      downvotes: item.downvotes - Number(item.my_vote === -1) + Number(nextVote === -1),
      my_vote: nextVote,
    } : item));
    try {
      await setReportVote(report.id, userId, nextVote);
      try {
        const engagement = await loadReportEngagement(report.id);
        if (activeUserId.current === userId) setPublicReports(current => current.map(item => item.id === report.id ? { ...item, ...engagement } : item));
      } catch {
        if (activeUserId.current === userId) setCommunityError('Vote saved, but counts could not be refreshed. Refresh the feed to sync.');
      }
    } catch (error) {
      if (activeUserId.current === userId) {
        setPublicReports(current => current.map(item => item.id === report.id && item.my_vote === nextVote ? {
          ...item,
          upvotes: item.upvotes - Number(nextVote === 1) + Number(report.my_vote === 1),
          downvotes: item.downvotes - Number(nextVote === -1) + Number(report.my_vote === -1),
          my_vote: report.my_vote,
        } : item));
        setCommunityError(error instanceof Error ? error.message : 'Could not save vote.');
      }
    } finally {
      communityActionInFlight.current = false;
      setCommunityBusyId(null);
    }
  }

  async function changeFlag(report: Report) {
    if (!session || communityActionInFlight.current) return;
    communityActionInFlight.current = true;
    const userId = session.user.id;
    const nextFlag = !report.my_flag;
    setCommunityBusyId(report.id);
    setCommunityError('');
    setPublicReports(current => current.map(item => item.id === report.id ? {
      ...item, my_flag: nextFlag, flagged_inaccurate: nextFlag || item.flagged_inaccurate,
    } : item));
    try {
      await setReportFlag(report.id, userId, nextFlag);
      try {
        const engagement = await loadReportEngagement(report.id);
        if (activeUserId.current === userId) setPublicReports(current => current.map(item => item.id === report.id ? { ...item, ...engagement } : item));
      } catch {
        if (activeUserId.current === userId) setCommunityError('Flag saved, but status could not be refreshed. Refresh the feed to sync.');
      }
    } catch (error) {
      if (activeUserId.current === userId) {
        setPublicReports(current => current.map(item => item.id === report.id && item.my_flag === nextFlag ? {
          ...item, my_flag: report.my_flag, flagged_inaccurate: report.flagged_inaccurate,
        } : item));
        setCommunityError(error instanceof Error ? error.message : 'Could not save flag.');
      }
    } finally {
      communityActionInFlight.current = false;
      setCommunityBusyId(null);
    }
  }

  async function chooseProfilePhoto() {
    if (!session || savingProfilePhoto) return;
    const userId = session.user.id;
    setProfilePhotoError('');
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setProfilePhotoError('Allow photo-library access to choose a profile picture.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;

      setSavingProfilePhoto(true);
      const url = await saveProfilePhoto(userId, result.assets[0]);
      if (activeUserId.current === userId) {
        setProfilePhotoUrl(url);
        setProfilePhotoOwnerId(userId);
      }
    } catch (error) {
      if (activeUserId.current === userId) {
        setProfilePhotoError(error instanceof Error ? error.message : 'Could not save your profile picture.');
      }
    } finally {
      setSavingProfilePhoto(false);
    }
  }

  async function signOut() {
    if (supabase && session) {
      await supabase.auth.signOut();
    }
    setPreviewMode(false);
    setPhotoAsset(null);
    setReportDetails(newReportDetails());
    setEditingReportId(null);
    setReports([]);
    setPublicReports([]);
    setPublicReportsViewerId(null);
    setReportsOwnerId(null);
    setProfilePhotoUrl(null);
    setProfilePhotoOwnerId(null);
    setProfilePhotoError('');
    setScreen('home');
  }

  async function saveDisplayName(name: string) {
    if (!supabase || !session) throw new Error('Sign in to save your display name.');
    const { data, error } = await supabase.auth.updateUser({ data: { display_name: name } });
    if (error) throw error;
    if (data.user) {
      setSession(current => current?.user.id === data.user.id ? { ...current, user: data.user } : current);
    }
  }

  if (!fontsLoaded && !fontError) {
    return <SafeAreaView style={styles.loadingScreen}><ActivityIndicator color={palette.black} size="large" /></SafeAreaView>;
  }

  if (loadingSession) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar style="dark" />
        <ActivityIndicator color={palette.black} size="large" />
        <Text style={styles.loadingText}>Opening your field log...</Text>
      </SafeAreaView>
    );
  }

  if (!session && !previewMode) {
    return <AuthScreen onPreview={() => setPreviewMode(true)} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appLayout}>
        <View style={styles.screenContainer}>
          {screen === 'home' ? (
            <HomeScreen
              profilePhotoUrl={visibleProfilePhoto}
              displayName={displayName}
              previewMode={previewMode}
              photoUri={photoAsset?.uri ?? null}
              reportDetails={reportDetails}
              onChangeReportDetails={setReportDetails}
              editingReportId={editingReportId}
              reports={visibleReports}
              reportsLoading={reportsLoading}
              reportError={reportError}
              savingReport={savingReport}
              onChoosePhoto={choosePhoto}
              onSubmitReport={saveReport}
              onCancelReportUpload={cancelReportUpload}
              onSaveEditedReport={saveEditedReport}
              onEditReport={(report) => {
                setPhotoAsset(null);
                setEditingReportId(report.id);
                setReportDetails({ observed_on: report.observed_on, place_name: report.place_name ?? '', caption: report.caption ?? '' });
              }}
              onCancelEdit={() => { setEditingReportId(null); setReportDetails(newReportDetails()); }}
              onRefreshReports={() => void refreshReports()}
              onIdentificationChanged={async () => {
                await refreshReports();
                await refreshCommunity();
              }}
              onOpenProfile={() => setScreen('profile')}
            />
          ) : screen === 'community' ? (
            <CommunityScreen key={session?.user.id ?? 'preview'} previewMode={previewMode} reports={visiblePublicReports}
              verificationReports={publicReportsViewerId === session?.user.id ? verificationReports : []} loading={communityLoading}
              error={communityError} busyId={communityBusyId} userId={session?.user.id ?? null}
              onRefresh={() => refreshCommunity()} onVote={(report, value) => void changeVote(report, value)}
              onFlag={(report) => void changeFlag(report)} onOpenLeaderboard={() => setScreen('leaderboard')} />
          ) : screen === 'leaderboard' ? (
            <LeaderboardScreen previewMode={previewMode} />
          ) : screen === 'admin' && adminRole.isAdmin && session ? (
            <AdminAccess key={session.user.id} userId={session.user.id} checkAccess={adminRole.refresh}
              onModerated={async () => { await Promise.all([refreshReports(), refreshCommunity()]); }} />
          ) : (
            <ProfileScreen
              email={session?.user.email ?? 'Preview account'}
              profilePhotoUrl={visibleProfilePhoto}
              profilePhotoError={profilePhotoError}
              savingProfilePhoto={savingProfilePhoto}
              onChooseProfilePhoto={chooseProfilePhoto}
              displayName={displayName}
              savedDisplayName={savedDisplayName}
              previewMode={previewMode}
              submittedCount={visibleReports.length}
              verifiedKills={visibleReports.reduce((sum, report) => sum + report.verified_kills, 0)}
              onSaveDisplayName={saveDisplayName}
              isAdmin={adminRole.isAdmin}
              accessError={adminRole.error}
              onRefreshAccess={() => { void adminRole.refresh(); }}
              onSignOut={signOut}
            />
          )}
        </View>
        <BottomNavigation activeScreen={screen === 'admin' && !adminRole.isAdmin ? 'profile' : screen} isAdmin={adminRole.isAdmin} onSelect={(next) => {
          if (next === 'admin') {
            const userId = session?.user.id;
            void adminRole.refresh().then(allowed => {
              if (allowed && userId && activeUserId.current === userId) setScreen('admin');
            });
            return;
          }
          setScreen(next);
          if (next === 'community' && session?.user.id) void refreshCommunity(session.user.id);
        }} />
      </View>
    </SafeAreaView>
  );
}

function AuthScreen({ onPreview }: { onPreview: () => void }) {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const hasAuthConfig = Boolean(supabase);

  async function submitAuth() {
    setMessage('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setMessage('Enter your email and password to continue.');
      return;
    }
    if (mode === 'sign-up') {
      const error = displayNameError(displayName);
      if (error) {
        setMessage(error);
        return;
      }
    }
    if (!supabase) {
      setMessage('Add your Supabase URL and anon key to .env to create an account.');
      return;
    }

    setBusy(true);
    const result = mode === 'sign-up'
      ? await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { display_name: displayName.trim() } },
        })
      : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
    } else if (mode === 'sign-up' && !result.data.session) {
      setMessage('Check your inbox to confirm your email, then come back to sign in.');
      setMode('sign-in');
    }
  }

  async function signInWithGoogle() {
    setMessage('');
    if (!supabase) {
      setMessage('Add your Supabase URL and anon key to .env to sign in.');
      return;
    }

    setBusy(true);
    try {
      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
        return;
      }

      const redirectTo = Linking.createURL('auth/callback', { scheme: 'lanterndie' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('Could not start Google sign-in.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return;
      if (result.url !== redirectTo && !result.url.startsWith(`${redirectTo}?`)
        && !result.url.startsWith(`${redirectTo}#`)) {
        throw new Error('Unexpected sign-in redirect.');
      }

      const callback = new URL(result.url);
      const params = new URLSearchParams(callback.hash.slice(1));
      const oauthError = params.get('error_description') ?? params.get('error')
        ?? callback.searchParams.get('error_description') ?? callback.searchParams.get('error');
      if (oauthError) throw new Error(oauthError);

      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken) throw new Error('Google sign-in did not return a session.');

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) throw sessionError;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.authKeyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.authTopline}>
            <Image accessibilityLabel="LanternDie logo" source={require('./assets/logo.png')} resizeMode="contain" style={styles.appLogo} />
            <Text style={styles.eyebrow}>COMMUNITY FIELD LOG</Text>
          </View>
          <View style={styles.authHero}>
            <Text style={styles.heroKicker}>A SMALL ACT, COUNTED.</Text>
            <Text style={styles.authTitle}>Make every{ '\n' }sighting count.</Text>
            <Text style={styles.authDescription}>
              Track your spotted lanternfly reports and the days you show up for your local ecosystem.
            </Text>
          </View>

          <View style={styles.authPanel}>
            <View style={styles.modeSwitch}>
              <Pressable
                onPress={() => { setMode('sign-in'); setMessage(''); }}
                style={[styles.modeButton, mode === 'sign-in' && styles.modeButtonActive]}
              >
                <Text style={[styles.modeText, mode === 'sign-in' && styles.modeTextActive]}>Sign in</Text>
              </Pressable>
              <Pressable
                onPress={() => { setMode('sign-up'); setMessage(''); }}
                style={[styles.modeButton, mode === 'sign-up' && styles.modeButtonActive]}
              >
                <Text style={[styles.modeText, mode === 'sign-up' && styles.modeTextActive]}>Create account</Text>
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#9AA098"
              style={styles.input}
              value={email}
            />
            {mode === 'sign-up' ? (
              <>
                <Text style={styles.inputLabel}>PUBLIC DISPLAY NAME</Text>
                <TextInput
                  accessibilityLabel="Public display name"
                  autoCapitalize="words"
                  maxLength={30}
                  onChangeText={setDisplayName}
                  placeholder="Choose a name"
                  placeholderTextColor="#9AA098"
                  style={styles.input}
                  value={displayName}
                />
                <Text style={styles.inputHint}>This is the name people will see when community features are available. Do not use your email.</Text>
              </>
            ) : null}
            <Text style={styles.inputLabel}>PASSWORD</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'password'}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor="#9AA098"
              secureTextEntry
              style={styles.input}
              value={password}
            />

            {message ? <Text accessibilityRole="alert" style={styles.formMessage}>{message}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={submitAuth}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}
            >
              {busy ? <ActivityIndicator color={palette.white} /> : (
                <Text style={styles.primaryButtonText}>{mode === 'sign-up' ? 'Create account' : 'Sign in'}  {'>'}</Text>
              )}
            </Pressable>

            <View style={styles.oauthDivider}><Text style={styles.oauthDividerText}>OR</Text></View>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={signInWithGoogle}
              style={({ pressed }) => [styles.oauthButton, pressed && styles.pressed, busy && styles.disabled]}
            >
              <Text style={styles.oauthButtonText}>Continue with Google</Text>
            </Pressable>

            {!hasAuthConfig ? (
              <View style={styles.previewBlock}>
                <Text style={styles.previewNote}>Backend credentials are not set up yet.</Text>
                <Pressable onPress={onPreview} style={styles.previewButton}>
                  <Text style={styles.previewButtonText}>Preview the app</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          <Text style={styles.authFooter}>YOUR FIELD LOG STARTS HERE</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HomeScreen({
  profilePhotoUrl,
  displayName,
  previewMode,
  photoUri,
  reportDetails,
  onChangeReportDetails,
  editingReportId,
  reports,
  reportsLoading,
  reportError,
  savingReport,
  onChoosePhoto,
  onSubmitReport,
  onCancelReportUpload,
  onSaveEditedReport,
  onEditReport,
  onCancelEdit,
  onRefreshReports,
  onIdentificationChanged,
  onOpenProfile,
}: {
  profilePhotoUrl: string | null;
  displayName: string;
  previewMode: boolean;
  photoUri: string | null;
  reportDetails: ReportDetails;
  onChangeReportDetails: (details: ReportDetails) => void;
  editingReportId: string | null;
  reports: Report[];
  reportsLoading: boolean;
  reportError: string;
  savingReport: boolean;
  onChoosePhoto: () => void;
  onSubmitReport: () => void;
  onCancelReportUpload: () => void;
  onSaveEditedReport: () => void;
  onEditReport: (report: Report) => void;
  onCancelEdit: () => void;
  onRefreshReports: () => void;
  onIdentificationChanged: () => Promise<void>;
  onOpenProfile: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <View style={styles.homeHeader}>
        <View>
          <View style={styles.homeBrandRow}>
            <Image accessibilityLabel="LanternDie logo" source={require('./assets/logo.png')} resizeMode="contain" style={styles.homeLogo} />
            <Text style={styles.homeBrandText}>LANTERNDIE  /  FIELD LOG</Text>
          </View>
        </View>
        <Pressable accessibilityLabel="Open profile" onPress={onOpenProfile} style={styles.avatarButton}>
          {profilePhotoUrl ? <Image source={{ uri: profilePhotoUrl }} style={styles.homeAvatarImage} /> : (
            <Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
          )}
        </Pressable>
      </View>

      {previewMode ? (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>PREVIEW MODE</Text>
          <Text style={styles.previewBannerDetail}>Progress is sample UI only and will not be saved.</Text>
        </View>
      ) : null}

      <View style={styles.streakCard}>
        <View style={styles.streakTopline}>
          <Text style={styles.streakLabel}>YOUR CURRENT STREAK</Text>
          <View style={styles.streakDot} />
        </View>
        <View style={styles.streakNumberRow}>
          <Text style={styles.streakNumber}>0</Text>
          <Text style={styles.streakDays}>DAYS</Text>
        </View>
        <View style={styles.streakDivider} />
        <View style={styles.streakBottomRow}>
          <Text style={styles.streakPrompt}>Start a new run today.</Text>
          <Text style={styles.streakMark}>01</Text>
        </View>
        <View pointerEvents="none" style={styles.streakDecor}>
          <View style={styles.streakDecorRing} />
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>SUBMITTED REPORTS</Text>
          <Text style={styles.statValue}>{reports.length}</Text>
          <Text style={styles.statFoot}>your field log</Text>
        </View>
        <View style={styles.statSeparator} />
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>VERIFIED KILLS</Text>
          <Text style={styles.statValue}>{reports.reduce((sum, report) => sum + report.verified_kills, 0)}</Text>
          <Text style={styles.statFoot}>earned together</Text>
        </View>
      </View>

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionEyebrow}>ADD TO THE COUNT</Text>
          <Text style={styles.sectionTitle}>Log a lanternfly</Text>
        </View>
      </View>

      {!editingReportId ? <Pressable
        accessibilityRole="button"
        onPress={onChoosePhoto}
        style={({ pressed }) => [styles.uploadButton, pressed && styles.pressed]}
      >
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
        ) : (
          <View style={styles.uploadIcon}><Text style={styles.uploadPlus}>+</Text></View>
        )}
        <View style={styles.uploadCopy}>
          <Text style={styles.uploadTitle}>{photoUri ? 'Choose another photo' : 'Add a photo'}</Text>
          <Text style={styles.uploadSubtitle}>{photoUri ? 'Tap to replace your selection' : 'Choose an image from your library'}</Text>
        </View>
        <Text style={styles.uploadArrow}>{'>'}</Text>
      </Pressable> : null}
      {photoUri ? (
        <View style={styles.selectedPhotoNotice}>
          <Text style={styles.selectedPhotoTitle}>PHOTO SELECTED</Text>
          <Text style={styles.selectedPhotoCopy}>
            {previewMode ? 'This preview stays on your device.' : 'Human-verified beta: photos are sent to Roboflow for detection, then community reviewers or admins decide alive/dead. Background checks continue after you leave. Reports publish after every insect is reviewed.'}
          </Text>
        </View>
      ) : null}
      {photoUri && !editingReportId ? (
        <>
          {!previewMode ? <ReportFields details={reportDetails} onChange={onChangeReportDetails} /> : null}
          <View style={styles.reportUploadActions}>
            {!previewMode ? <Pressable
              accessibilityRole="button"
              disabled={savingReport}
              onPress={onSubmitReport}
              style={[styles.primaryButton, styles.reportSubmitButton, savingReport && styles.disabled]}
            >
              {savingReport ? <><ActivityIndicator color={palette.white} /><Text style={styles.primaryButtonText}>Uploading…</Text></> : <Text style={styles.primaryButtonText}>Submit report</Text>}
            </Pressable> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel report upload" disabled={savingReport}
              onPress={onCancelReportUpload} style={[styles.cancelUploadButton, previewMode && styles.cancelUploadButtonFull, savingReport && styles.disabled]}>
              <Text style={styles.cancelUploadText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : null}
      {reportError ? <Text accessibilityRole="alert" style={styles.formMessage}>{reportError}</Text> : null}
      {savingReport && !photoUri ? <Text accessibilityLiveRegion="polite" style={styles.formMessage}>Report saved. Background checks will continue automatically.</Text> : null}

      <View style={styles.privacyNote}>
        <Text style={styles.privacyGlyph}>i</Text>
        <Text style={styles.privacyText}>Location is optional place text. Device GPS is not collected.</Text>
      </View>

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionEyebrow}>YOUR RECORD</Text>
          <Text style={styles.sectionTitle}>Recent activity</Text>
        </View>
      </View>
      {!previewMode ? (
        <Pressable accessibilityRole="button" onPress={onRefreshReports} style={styles.refreshButton}>
          <Text style={styles.refreshText}>Refresh reports</Text>
        </Pressable>
      ) : null}
      {reportsLoading ? <ActivityIndicator color={palette.red} /> : reports.length ? (
        reports.map((report) => (
          <View key={report.id} style={styles.reportCard}>
            <View style={styles.reportRow}>
              {report.photo_url ? <Image source={{ uri: report.photo_url }} style={styles.reportPhoto} /> : <View style={styles.reportPhoto} />}
              <View style={styles.reportCopy}>
                <Text style={styles.emptyActivityTitle}>{report.workflow_status === 'published' ? 'Published report' : 'Your submission'}</Text>
                <Text accessibilityLiveRegion="polite" style={styles.emptyActivityCopy}>{reportProcessingMessage(report.workflow_status, report.processing)}</Text>
                <Text style={styles.emptyActivityCopy}>Observed {report.observed_on}{report.place_name ? ` · ${report.place_name}` : ''}</Text>
                {report.caption ? <Text style={styles.emptyActivityCopy}>{report.caption}</Text> : null}
                {report.flagged_inaccurate ? <Text style={styles.emptyActivityCopy}>Flagged for inaccuracy</Text> : null}
              </View>
              <View style={styles.reportAside}>
                <Text accessibilityLabel={`Score ${reportScore(report)}`} style={styles.reportScore}>{reportScore(report)}</Text>
                {!previewMode ? <Pressable accessibilityRole="button" accessibilityLabel="Edit report details" onPress={() => onEditReport(report)}><Text style={styles.refreshText}>Edit</Text></Pressable> : null}
              </View>
            </View>
            <ReportIdentification report={report} onChanged={onIdentificationChanged} />
            {editingReportId === report.id ? <View style={styles.editPanel}>
              <ReportFields details={reportDetails} onChange={onChangeReportDetails} />
              <Pressable accessibilityRole="button" disabled={savingReport} onPress={onSaveEditedReport} style={[styles.primaryButton, savingReport && styles.disabled]}>
                <Text style={styles.primaryButtonText}>{savingReport ? 'Saving...' : 'Save details'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onCancelEdit} style={styles.refreshButton}><Text style={styles.refreshText}>Cancel</Text></Pressable>
            </View> : null}
          </View>
        ))
      ) : (
        <View style={styles.emptyActivity}>
          <View style={styles.emptyActivityLine} />
          <Text style={styles.emptyActivityTitle}>Nothing logged yet</Text>
          <Text style={styles.emptyActivityCopy}>Your submitted reports will appear here.</Text>
        </View>
      )}
      <Text style={styles.homeFooter}>A COMMUNITY EFFORT FOR HEALTHIER HABITATS</Text>
    </ScrollView>
  );
}

function ReportFields({ details, onChange }: { details: ReportDetails; onChange: (details: ReportDetails) => void }) {
  return <View style={styles.reportFields}>
    <Text style={styles.reportInputLabel}>OBSERVATION DATE · YYYY-MM-DD</Text>
    <TextInput accessibilityLabel="Observation date" value={details.observed_on} onChangeText={observed_on => onChange({ ...details, observed_on })}
      placeholder="YYYY-MM-DD" placeholderTextColor="#9AA098" style={styles.reportInput} autoCapitalize="none" />
    <Text style={styles.reportInputLabel}>LOCATION · OPTIONAL</Text>
    <TextInput accessibilityLabel="General location" value={details.place_name} onChangeText={place_name => onChange({ ...details, place_name })}
      placeholder="City, park, or general area" placeholderTextColor="#9AA098" maxLength={100} style={styles.reportInput} />
    <Text style={styles.reportInputLabel}>CAPTION · OPTIONAL</Text>
    <TextInput accessibilityLabel="Report caption" value={details.caption} onChangeText={caption => onChange({ ...details, caption })}
      placeholder="Add context about the sighting" placeholderTextColor="#9AA098" maxLength={280} multiline style={[styles.reportInput, styles.captionInput]} />
    <Text style={styles.privacyText}>Approved reports are public to signed-in members. Pending submissions are available to reviewers and admins.</Text>
  </View>;
}

const CommunityPhoto = memo(function CommunityPhoto({ uri }: { uri: string | null }) {
  return uri ? <Image source={{ uri }} style={styles.communityPhoto} /> : <View style={styles.communityPhoto} />;
});

function CommunityAuthor({ report }: { report: Report }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const photoUri = report.author_photo_url;
  return <View style={styles.communityAuthor}>
    <View style={styles.communityAuthorAvatar}>
      {photoUri && photoUri !== failedUri ? <Image source={{ uri: photoUri }} style={styles.communityAuthorPhoto}
        accessibilityLabel={`${report.author_name}'s profile photo`} onError={() => setFailedUri(photoUri)} />
        : <Text style={styles.avatarText}>{report.author_name.trim().slice(0, 1).toUpperCase() || '?'}</Text>}
    </View>
    <Text style={[styles.emptyActivityTitle, styles.communityAuthorName]}>{report.author_name}</Text>
  </View>;
}

function CommunityResultsButton({ report, review = false, onPress }: { report: Report; review?: boolean; onPress: () => void }) {
  const label = review ? 'Review sighting' : identificationActionLabel(report);
  return <Pressable accessibilityRole="button" accessibilityLabel={review ? `Review sighting by ${report.author_name}` : `View identification results for sighting by ${report.author_name}: ${label}`}
    onPress={onPress} style={({ pressed }) => [styles.communityResultsButton, report.photo_url ? styles.communityResultsOverlay : styles.communityResultsFallback, pressed && styles.pressed]}>
    <Search size={18} color={palette.ink} strokeWidth={2} />
    <Text style={styles.communityResultsText}>{label}</Text>
  </Pressable>;
}

function CommunityScreen({ previewMode, reports, verificationReports, loading, error, busyId, userId, onRefresh, onVote, onFlag, onOpenLeaderboard }: {
  previewMode: boolean; reports: Report[]; verificationReports: Report[]; loading: boolean; error: string; busyId: string | null; userId: string | null;
  onRefresh: () => Promise<void>; onVote: (report: Report, value: -1 | 1) => void; onFlag: (report: Report) => void;
  onOpenLeaderboard: () => void;
}) {
  const [verificationOnly, setVerificationOnly] = useState(false);
  const [reviewReport, setReviewReport] = useState<Report | null>(null);
  const [resultsReport, setResultsReport] = useState<Report | null>(null);
  const reviewReports = verificationReports;
  const displayed = verificationOnly ? reviewReports : reports;
  return (<>
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <View style={styles.communityHeader}>
        <Image accessibilityLabel="LanternDie logo" source={require('./assets/logo.png')} resizeMode="contain" style={styles.pageLogo} />
        <Text style={styles.eyebrow}>LANTERNDIE  /  COMMUNITY</Text>
      </View>
      {previewMode ? (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>PREVIEW MODE</Text>
          <Text style={styles.previewBannerDetail}>Community data is not connected yet.</Text>
        </View>
      ) : null}

      <View style={styles.feedToolbar}>
        <View style={styles.feedFilters}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: !verificationOnly }}
            onPress={() => setVerificationOnly(false)}
            style={({ pressed }) => [styles.feedFilterButton, !verificationOnly && styles.feedFilterSelected, pressed && styles.pressed]}>
            <Text style={[styles.feedFilterText, !verificationOnly && styles.feedFilterTextSelected]}>All sightings</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: verificationOnly }}
            onPress={() => setVerificationOnly(true)}
            style={({ pressed }) => [styles.feedFilterButton, verificationOnly && styles.feedFilterSelected, pressed && styles.pressed]}>
            <Text style={[styles.feedFilterText, verificationOnly && styles.feedFilterTextSelected]}>Needs your verification ({reviewReports.length})</Text>
          </Pressable>
        </View>
        {!previewMode ? <Pressable accessibilityRole="button" accessibilityLabel="Refresh feed"
          accessibilityState={{ disabled: loading, busy: loading }} disabled={loading} onPress={onRefresh}
          style={({ pressed }) => [styles.feedReloadButton, loading && styles.disabled, pressed && styles.pressed]}>
          {loading ? <ActivityIndicator size="small" color={palette.red} /> : <RotateCw color={palette.red} size={20} strokeWidth={2} />}
        </Pressable> : null}
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.formMessage}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={palette.red} /> : displayed.map(report => <View key={report.id} style={styles.communityCard}>
        {report.photo_url ? <View style={styles.communityPhotoContainer}>
          {verificationOnly ? <Pressable accessibilityRole="button" accessibilityLabel={`Review sighting by ${report.author_name}`}
            onPress={() => setReviewReport(report)}>
            <CommunityPhoto uri={report.photo_url} />
          </Pressable> : <CommunityPhoto uri={report.photo_url} />}
          <CommunityResultsButton report={report} review={verificationOnly}
            onPress={() => verificationOnly ? setReviewReport(report) : setResultsReport(report)} />
        </View> : <CommunityResultsButton report={report} review={verificationOnly}
            onPress={() => verificationOnly ? setReviewReport(report) : setResultsReport(report)} />}
        <CommunityAuthor report={report} />
        <Text style={styles.emptyActivityCopy}>Observed {report.observed_on}{report.place_name ? ` · ${report.place_name}` : ''}</Text>
        {report.caption ? <Text style={styles.communityCaption}>{report.caption}</Text> : null}
        {report.flagged_inaccurate ? <Text style={styles.flagBadge}>Flagged for inaccuracy</Text> : null}
        {report.workflow_status === 'published' ? <View style={styles.actionRow}>
          {report.user_id !== userId ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Upvote report" accessibilityState={{ selected: report.my_vote === 1 }}
              disabled={Boolean(busyId)} onPress={() => onVote(report, 1)} style={[styles.voteButton, report.my_vote === 1 && styles.voteButtonSelected]}>
              <Text style={report.my_vote === 1 ? styles.voteArrowSelected : styles.voteArrow}>↑</Text>
            </Pressable>
          ) : null}
          <Text accessibilityLabel={`Score ${reportScore(report)}`} style={styles.communityScore}>{reportScore(report)}</Text>
          {report.user_id !== userId ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Downvote report" accessibilityState={{ selected: report.my_vote === -1 }}
              disabled={Boolean(busyId)} onPress={() => onVote(report, -1)} style={[styles.voteButton, report.my_vote === -1 && styles.voteButtonSelected]}>
              <Text style={report.my_vote === -1 ? styles.voteArrowSelected : styles.voteArrow}>↓</Text>
            </Pressable>
          ) : null}
        </View> : null}
        {report.workflow_status === 'published' && report.user_id !== userId ? <Pressable accessibilityRole="button" accessibilityLabel={report.my_flag ? 'Remove inaccuracy flag' : 'Flag as inaccurate'}
          disabled={Boolean(busyId)} onPress={() => onFlag(report)} style={styles.flagAction}>
          <Flag color={palette.red} size={14} strokeWidth={2} />
          <Text style={report.my_flag ? styles.actionSelected : styles.refreshText}>{report.my_flag ? 'Unflag inaccuracy' : 'Flag inaccuracy'}</Text>
        </Pressable> : null}
      </View>)}
      {!loading && !displayed.length ? <View style={styles.communityEmpty}>
        <View style={styles.communityEmptyMark}><Text style={styles.communityEmptyGlyph}>+</Text></View>
        <Text style={styles.emptyActivityTitle}>{verificationOnly ? 'No sightings need your review' : 'The field is quiet'}</Text>
        <Text style={styles.emptyActivityCopy}>Public reports will show up here.</Text>
      </View> : null}

      <View style={[styles.sectionHeadingRow, styles.communitySectionGap]}>
        <View>
          <Text style={styles.sectionEyebrow}>THIS WEEK</Text>
          <Text style={styles.sectionTitle}>Leaderboard</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="View leaderboard" onPress={onOpenLeaderboard} style={({ pressed }) => [styles.leaderboardLink, pressed && styles.pressed]}>
        <View style={styles.leaderboardLinkIcon}>
          <Image accessibilityElementsHidden source={require('./assets/star.png')} resizeMode="contain" style={styles.communityLeaderboardIcon} />
        </View>
        <View style={styles.leaderboardCopy}>
          <Text style={styles.leaderboardTitle}>Weekly and monthly verified rankings</Text>
          <Text style={styles.emptyActivityCopy}>Verified dead insects on published reports count toward rankings.</Text>
        </View>
        <Text style={styles.leaderboardArrow}>›</Text>
      </Pressable>
      <Text style={styles.homeFooter}>A COMMUNITY EFFORT FOR HEALTHIER HABITATS</Text>
    </ScrollView>
    <IdentificationResultsModal report={resultsReport} onClose={() => setResultsReport(null)} />
    {reviewReport ? <CommunityReview key={reviewReport.id} report={reviewReport}
      onClose={() => { setReviewReport(null); void onRefresh(); }} onChanged={onRefresh} /> : null}
  </>);
}

function LeaderboardScreen({ previewMode }: { previewMode: boolean }) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [rankings, setRankings] = useState<LeaderboardEntry[]>([]);
  const [loadingRankings, setLoadingRankings] = useState(!previewMode);
  const [rankingError, setRankingError] = useState('');
  const winnerTitle = period === 'weekly' ? 'WEEKLY TOP KILLER' : 'MONTHLY TOP KILLER';

  useEffect(() => {
    if (previewMode) {
      setRankings(previewLeaderboardRankings[period]);
      setLoadingRankings(false);
      setRankingError('');
      return;
    }

    let active = true;
    setLoadingRankings(true);
    setRankingError('');
    loadLeaderboard(period)
      .then(entries => {
        if (active) setRankings(entries);
      })
      .catch(error => {
        if (active) setRankingError(error instanceof Error ? error.message : 'Could not load leaderboard.');
      })
      .finally(() => {
        if (active) setLoadingRankings(false);
      });
    return () => { active = false; };
  }, [period, previewMode]);

  return (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <View style={styles.leaderboardHeader}>
        <Image accessibilityLabel="LanternDie logo" source={require('./assets/logo.png')} resizeMode="contain" style={styles.pageLogo} />
        <Text style={styles.eyebrow}>LANTERNDIE  /  RANKINGS</Text>
        <Text style={styles.leaderboardPageTitle}>Leaderboard</Text>
        <Text style={styles.communityDescription}>Rankings based on verified dead insects in published reports.</Text>
      </View>

      <View style={styles.previewBanner}>
        <Text style={styles.previewBannerText}>{previewMode ? 'PREVIEW SAMPLE' : 'HUMAN-VERIFIED BETA'}</Text>
        <Text style={styles.previewBannerDetail}>
          {previewMode
            ? 'Sample rankings for layout testing; not connected to reports.'
            : 'Community reviewers or admins verify every insect. Each verified dead insect earns one kill credit. Alive sightings earn zero.'}
        </Text>
      </View>

      <View style={styles.leaderboardPanel}>
        <View style={styles.leaderboardFilters}>
          {(['weekly', 'monthly'] as const).map(option => {
            const selected = period === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setPeriod(option)}
                style={[styles.leaderboardFilter, selected && styles.leaderboardFilterSelected]}
              >
                <Image
                  accessibilityElementsHidden
                  source={badgeIcons[option === 'weekly' ? 'Weekly Top Killer' : 'Monthly Top Killer']}
                  resizeMode="contain"
                  style={styles.leaderboardFilterIcon}
                />
                <Text style={[styles.leaderboardFilterText, selected && styles.leaderboardFilterTextSelected]}>
                  {option === 'weekly' ? 'Weekly' : 'Monthly'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.leaderboardPeriodHeading}>
          <View>
            <Text style={styles.sectionEyebrow}>{period === 'weekly' ? 'THIS WEEK' : 'THIS MONTH'}</Text>
            <Text style={styles.sectionTitle}>{period === 'weekly' ? 'Weekly leaders' : 'Monthly leaders'}</Text>
          </View>
          <Image
            accessibilityLabel={period === 'weekly' ? 'Weekly Top Killer badge' : 'Monthly Top Killer badge'}
            source={badgeIcons[period === 'weekly' ? 'Weekly Top Killer' : 'Monthly Top Killer']}
            resizeMode="contain"
            style={styles.leaderboardPeriodIcon}
          />
        </View>

        {rankingError ? (
          <Text accessibilityRole="alert" style={styles.formMessage}>{rankingError}</Text>
        ) : loadingRankings ? (
          <ActivityIndicator color={palette.ink} />
        ) : rankings.length ? rankings.map((entry, index) => (
          <View key={`${period}-${entry.name}`} style={styles.leaderboardRow}>
            <Text style={styles.leaderboardRank}>{String(index + 1).padStart(2, '0')}</Text>
            {entry.avatarUrl ? (
              <Image source={{ uri: entry.avatarUrl }} style={styles.leaderboardAvatar} />
            ) : (
              <View style={styles.leaderboardAvatar}><Text style={styles.leaderboardAvatarText}>{entry.initials}</Text></View>
            )}
            <View style={styles.leaderboardDetails}>
              <Text numberOfLines={1} style={styles.leaderboardName}>{entry.name}</Text>
              {index === 0 ? (
                <View style={styles.winnerBadge}>
                  <BadgeIconSlot size={18} source={badgeIcons[winnerTitle === 'WEEKLY TOP KILLER' ? 'Weekly Top Killer' : 'Monthly Top Killer']} />
                  <Text style={styles.winnerBadgeText}>{winnerTitle}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.leaderboardCount}>
              <Text style={styles.leaderboardCountValue}>{entry.verifiedKills}</Text>
              <Text style={styles.leaderboardCountLabel}>{previewMode ? 'SAMPLE' : 'UPLOADS'}</Text>
            </View>
          </View>
        )) : (
          <View style={styles.leaderboardEmptyState}>
            <View style={styles.leaderboardEmptyIcon}><Trophy color={palette.red} size={22} strokeWidth={1.8} /></View>
            <Text style={styles.leaderboardEmptyTitle}>No verified kills in this period</Text>
            <Text style={styles.leaderboardEmptyCopy}>Rankings appear after dead insects are verified and their reports publish.</Text>
          </View>
        )}
      </View>

      <View style={[styles.sectionHeadingRow, styles.communitySectionGap]}>
        <View>
          <Text style={styles.sectionEyebrow}>FIELD BADGES</Text>
          <Text style={styles.sectionTitle}>More ways to shine</Text>
        </View>
      </View>
      <BadgePreviewRow title="Local Star" description="Top verified contributor within 5 miles. Location matching is not available yet." />
      <BadgePreviewRow title="Kill Streak" description="Recognizes consecutive days with verified kills." />
      <BadgePreviewRow title="Best Streak" description="Your personal record for consecutive verified days." />
      <Text style={styles.homeFooter}>A COMMUNITY EFFORT FOR HEALTHIER HABITATS</Text>
    </ScrollView>
  );
}

function BadgeIconSlot({ size = 34, source }: { size?: number; source?: ImageSourcePropType }) {
  return source ? (
    <Image accessibilityElementsHidden source={source} resizeMode="contain" style={{ width: size, height: size }} />
  ) : (
    <View accessibilityElementsHidden style={[styles.badgeIconSlot, { width: size, height: size }]} />
  );
}

function BadgePreviewRow({ title, description, status = 'SOON' }: { title: string; description: string; status?: string }) {
  return (
    <View style={styles.badgePreviewRow}>
      <BadgeIconSlot source={badgeIcons[title]} />
      <View style={styles.badgeCopy}>
        <Text style={styles.badgeTitle}>{title}</Text>
        <Text style={styles.badgeDescription}>{description}</Text>
      </View>
      <Text style={styles.badgeLocked}>{status}</Text>
    </View>
  );
}

function BottomNavigation({
  activeScreen,
  isAdmin,
  onSelect,
}: {
  activeScreen: Screen;
  isAdmin: boolean;
  onSelect: (screen: Screen) => void;
}) {
  const tabs = [
    { screen: 'home' as const, label: 'Home', Icon: House },
    { screen: 'community' as const, label: 'Community', Icon: UsersRound },
    { screen: 'leaderboard' as const, label: 'Leaderboard', Icon: Trophy },
    { screen: 'profile' as const, label: 'My Profile', Icon: UserRound },
    ...(isAdmin ? [{ screen: 'admin' as const, label: 'Admin', Icon: Shield }] : []),
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.map(({ screen: tabScreen, label, Icon }) => {
        const active = activeScreen === tabScreen;
        const color = active ? palette.red : palette.muted;
        return (
          <Pressable
            key={tabScreen}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(tabScreen)}
            style={styles.tabButton}
          >
            <Icon color={color} size={18} strokeWidth={active ? 2.4 : 1.8} />
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProfileScreen({
  email,
  profilePhotoUrl,
  profilePhotoError,
  savingProfilePhoto,
  onChooseProfilePhoto,
  displayName,
  savedDisplayName,
  previewMode,
  submittedCount,
  verifiedKills,
  isAdmin,
  accessError,
  onRefreshAccess,
  onSaveDisplayName,
  onSignOut,
}: {
  email: string;
  profilePhotoUrl: string | null;
  profilePhotoError: string;
  savingProfilePhoto: boolean;
  onChooseProfilePhoto: () => void;
  displayName: string;
  savedDisplayName: string;
  previewMode: boolean;
  submittedCount: number;
  verifiedKills: number;
  isAdmin: boolean;
  accessError: string;
  onRefreshAccess: () => void;
  onSaveDisplayName: (name: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(savedDisplayName);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState('');

  useEffect(() => {
    setNameDraft(savedDisplayName);
  }, [savedDisplayName, email]);

  async function saveName() {
    if (savingName) return;
    if (nameDraft.trim() === savedDisplayName) {
      setEditingName(false);
      return;
    }
    const error = displayNameError(nameDraft);
    if (error) {
      setNameMessage(error);
      return;
    }
    setSavingName(true);
    setNameMessage('');
    try {
      await onSaveDisplayName(nameDraft.trim());
      setEditingName(false);
    } catch (error) {
      setNameMessage(error instanceof Error ? error.message : 'Could not save your display name.');
    } finally {
      setSavingName(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <View style={styles.profileHeader}>
        <Image accessibilityLabel="LanternDie logo" source={require('./assets/logo.png')} resizeMode="contain" style={styles.pageLogo} />
        <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
      </View>
      <Text style={styles.profileTitle}>Profile</Text>
      <View style={styles.profileIdentity}>
        <Pressable
          accessibilityLabel="Change profile picture"
          accessibilityRole="button"
          disabled={previewMode || savingProfilePhoto}
          onPress={onChooseProfilePhoto}
          style={({ pressed }) => [styles.profilePhotoButton, pressed && styles.pressed, (previewMode || savingProfilePhoto) && styles.disabled]}
        >
          <View style={styles.profileAvatar}>
            {profilePhotoUrl ? <Image source={{ uri: profilePhotoUrl }} style={styles.profileAvatarImage} /> : (
              <Text style={styles.profileAvatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
            )}
          </View>
          {!previewMode ? (
            <View style={styles.profilePhotoBadge}>
              {savingProfilePhoto ? <ActivityIndicator color={palette.white} size="small" /> : (
                <Pencil color={palette.white} size={15} strokeWidth={2.5} />
              )}
            </View>
          ) : null}
        </Pressable>
        <View style={styles.profileIdentityCopy}>
          {editingName ? (
            <>
              <TextInput
                accessibilityLabel="Display name"
                autoCapitalize="words"
                autoFocus
                maxLength={30}
                onChangeText={(value) => { setNameDraft(value); setNameMessage(''); }}
                onSubmitEditing={() => void saveName()}
                placeholder="Choose a name"
                placeholderTextColor="#9AA098"
                returnKeyType="done"
                style={styles.profileNameInput}
                value={nameDraft}
              />
              {nameMessage ? <Text accessibilityRole="alert" style={styles.nameMessage}>{nameMessage}</Text> : null}
              <View style={styles.nameActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={savingName}
                  onPress={() => void saveName()}
                  style={({ pressed }) => [styles.nameActionButton, pressed && styles.pressed, savingName && styles.disabled]}
                >
                  <Text style={styles.nameSaveText}>{savingName ? 'Saving...' : 'Save'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={savingName}
                  onPress={() => { setNameDraft(savedDisplayName); setNameMessage(''); setEditingName(false); }}
                  style={({ pressed }) => [styles.nameCancelButton, pressed && styles.pressed, savingName && styles.disabled]}
                >
                  <Text style={styles.nameCancelText}>Cancel</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable
              accessibilityLabel="Edit display name"
              accessibilityRole="button"
              disabled={previewMode}
              onPress={() => { setNameDraft(savedDisplayName); setNameMessage(''); setEditingName(true); }}
              style={({ pressed }) => [styles.profileNameButton, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.profileName}>{displayName}</Text>
            </Pressable>
          )}
          <View style={styles.profileModeRow}>
            <Text style={styles.profileMode}>{previewMode ? 'PREVIEW ACCOUNT' : 'DISPLAY NAME'}</Text>
            {!previewMode && !editingName ? (
              <Pressable
                accessibilityLabel="Edit display name"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => { setNameDraft(savedDisplayName); setNameMessage(''); setEditingName(true); }}
                style={({ pressed }) => [styles.profileNamePenButton, pressed && styles.pressed]}
              >
                <View style={styles.profileNamePen}><Pencil color={palette.white} size={11} strokeWidth={2.5} /></View>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      {previewMode ? <Text style={styles.profilePhotoHint}>Sign in to save a profile picture.</Text> : null}
      {profilePhotoError ? <Text accessibilityRole="alert" style={styles.formMessage}>{profilePhotoError}</Text> : null}

      <Text style={styles.sectionEyebrow}>YOUR PROGRESS</Text>
      <View style={styles.profileStats}>
        <ProfileStat label="SUBMITTED REPORTS" value={String(submittedCount)} />
        <ProfileStat label="STREAK" value="0 days" />
        <ProfileStat label="VERIFIED KILLS" value={String(verifiedKills)} />
        <ProfileStat label="FIELD POINTS" value="0" />
      </View>

      <Text style={[styles.sectionEyebrow, styles.badgesEyebrow]}>BADGES</Text>
      <BadgePreviewRow title="First report" description="Log your first verified lanternfly." status="LOCKED" />
      <BadgePreviewRow title="Weekly Top Killer" description="Most verified kills this week." />
      <BadgePreviewRow title="Monthly Top Killer" description="Most verified kills this month." />
      <BadgePreviewRow title="Local Star" description="Top verified contributor within 5 miles. Location matching is not available yet." />
      <BadgePreviewRow title="Kill Streak" description="Consecutive days with verified kills." />
      <BadgePreviewRow title="Best Streak" description="Your personal record for consecutive verified days." />

      <View style={styles.accountNote}>
        <Text style={styles.accountNoteTitle}>ACCOUNT & PRIVACY</Text>
        {isAdmin ? <Text style={styles.accountNoteText}>Administrator access</Text> : null}
        {accessError ? <Text accessibilityRole="alert" style={styles.formMessage}>{accessError}</Text> : null}
        {!previewMode ? <Pressable accessibilityRole="button" onPress={onRefreshAccess} style={styles.refreshButton}>
          <Text style={styles.refreshText}>Refresh account access</Text>
        </Pressable> : null}
        <Text style={styles.accountNoteText}>Sign-in email: {email}. Your email stays private. Public reports show your display name and any place you choose to add.</Text>
      </View>
      <Pressable onPress={onSignOut} style={styles.signOutButton}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
      <Text style={styles.homeFooter}>LANTERNDIE  /  FIELD LOG  /  V 1.0</Text>
    </ScrollView>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileStatRow}>
      <Text style={styles.profileStatLabel}>{label}</Text>
      <Text style={styles.profileStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  appLayout: { flex: 1 },
  screenContainer: { flex: 1 },
  tabBar: { minHeight: 62, flexDirection: 'row', backgroundColor: palette.white, borderTopWidth: 1, borderTopColor: palette.line, paddingHorizontal: 4, paddingTop: 7, paddingBottom: 4 },
  tabButton: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 3 },
  tabLabel: { color: palette.muted, fontSize: 9, fontWeight: '600' },
  tabLabelActive: { color: palette.red, fontWeight: '800' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  loadingText: { marginTop: 14, color: palette.muted, fontSize: 14 },
  authKeyboard: { flex: 1 },
  authScroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 28 },
  authTopline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appLogo: { width: 42, height: 42 },
  pageLogo: { width: 48, height: 48, marginBottom: 8 },
  homeLogo: { width: 48, height: 48 },
  homeBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  homeBrandText: { color: palette.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  brandMark: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: palette.black, color: palette.red, fontSize: 12, fontWeight: '800' },
  eyebrow: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  authHero: { paddingTop: 48, paddingBottom: 28 },
  heroKicker: { color: palette.red, fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 12 },
  authTitle: { color: palette.ink, fontSize: 42, lineHeight: 47 },
  authDescription: { color: '#565656', fontSize: 15, lineHeight: 23, marginTop: 14, maxWidth: 330 },
  authPanel: { borderRadius: 16, backgroundColor: palette.paper, padding: 18, borderWidth: 1, borderColor: palette.line },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#F1F1F1', padding: 3, marginBottom: 22 },
  modeButton: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  modeButtonActive: { backgroundColor: palette.black },
  modeText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  modeTextActive: { color: palette.white },
  inputLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginTop: 10 },
  input: { height: 48, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 13, color: palette.ink, fontSize: 14, backgroundColor: '#FFF' },
  inputHint: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  formMessage: { color: '#B4232A', fontSize: 12, lineHeight: 18, marginTop: 12 },
  primaryButton: { minHeight: 50, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  primaryButtonText: { color: palette.white, fontWeight: '700', fontSize: 14 },
  oauthDivider: { alignItems: 'center', marginTop: 18, marginBottom: 14 },
  oauthDividerText: { color: palette.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  oauthButton: { minHeight: 50, borderWidth: 1, borderColor: palette.ink, alignItems: 'center', justifyContent: 'center' },
  oauthButtonText: { color: palette.ink, fontWeight: '700', fontSize: 14 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.65 },
  previewBlock: { borderTopWidth: 1, borderTopColor: palette.line, marginTop: 18, paddingTop: 14, alignItems: 'center' },
  previewNote: { color: palette.muted, fontSize: 11, textAlign: 'center' },
  previewButton: { paddingVertical: 12, paddingHorizontal: 16 },
  previewButtonText: { color: palette.red, fontSize: 13, fontWeight: '800' },
  authFooter: { color: '#93988F', textAlign: 'center', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 24 },
  pageContent: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 34 },
  homeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  greeting: { color: palette.ink, fontSize: 26, marginTop: 5 },
  avatarButton: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', backgroundColor: palette.paleRed, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.red },
  homeAvatarImage: { width: 40, height: 40 },
  avatarText: { color: palette.red, fontSize: 15, fontWeight: '800' },
  previewBanner: { borderRadius: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, backgroundColor: palette.paleRed, borderLeftWidth: 3, borderLeftColor: palette.red, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 14 },
  previewBannerText: { color: palette.red, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  previewBannerDetail: { color: '#555555', fontSize: 10, flexShrink: 1 },
  streakCard: { borderRadius: 16, backgroundColor: palette.black, minHeight: 208, padding: 20, overflow: 'hidden', position: 'relative' },
  streakTopline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakLabel: { color: '#E6E6E6', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  streakDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.red },
  streakNumberRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 16 },
  streakNumber: { color: palette.red, fontSize: 70, lineHeight: 78 },
  streakDays: { color: palette.white, fontSize: 11, fontWeight: '800', letterSpacing: 1.8, marginLeft: 10 },
  streakDivider: { height: 1, backgroundColor: '#414141', marginTop: 7, marginBottom: 12 },
  streakBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakPrompt: { color: '#E6E6E6', fontSize: 12 },
  streakMark: { color: '#B8B8B8', fontSize: 10, fontWeight: '700' },
  streakDecor: { position: 'absolute', width: 120, height: 120, borderWidth: 1, borderColor: '#353535', borderRadius: 60, right: -48, top: 48, alignItems: 'center', justifyContent: 'center' },
  streakDecorRing: { width: 82, height: 82, borderWidth: 1, borderColor: '#353535', borderRadius: 41 },
  statsRow: { borderRadius: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, borderBottomWidth: 1, borderColor: palette.line, paddingVertical: 17, marginBottom: 27 },
  statBlock: { flex: 1, paddingHorizontal: 13 },
  statLabel: { color: palette.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  statValue: { color: palette.ink, fontSize: 28, lineHeight: 34, marginTop: 5 },
  statFoot: { color: palette.muted, fontSize: 10 },
  statSeparator: { width: 1, height: 46, backgroundColor: palette.line },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 13 },
  sectionEyebrow: { color: palette.red, fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  sectionTitle: { color: palette.ink, fontSize: 21, marginTop: 4 },
  uploadButton: { borderRadius: 16, minHeight: 86, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, padding: 12, flexDirection: 'row', alignItems: 'center' },
  uploadIcon: { borderRadius: 8, width: 54, height: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paleRed },
  uploadPlus: { color: palette.red, fontSize: 30, lineHeight: 34, fontWeight: '300' },
  photoPreview: { borderRadius: 8, width: 70, height: 58, backgroundColor: palette.line },
  uploadCopy: { flex: 1, paddingHorizontal: 13 },
  uploadTitle: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  uploadSubtitle: { color: palette.muted, fontSize: 10, marginTop: 5 },
  uploadArrow: { color: palette.red, fontSize: 17, fontWeight: '600', paddingHorizontal: 5 },
  selectedPhotoNotice: { borderRadius: 8, backgroundColor: '#F0F0F0', padding: 11, marginTop: 8 },
  selectedPhotoTitle: { color: palette.red, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  selectedPhotoCopy: { color: '#5D665D', fontSize: 11, lineHeight: 16, marginTop: 4 },
  reportUploadActions: { flexDirection: 'row', gap: 10 },
  reportSubmitButton: { flex: 1 },
  cancelUploadButton: { minWidth: 100, minHeight: 50, borderWidth: 1, borderColor: palette.red, alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 16 },
  cancelUploadButtonFull: { flex: 1 },
  cancelUploadText: { color: palette.red, fontSize: 14, fontWeight: '700' },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 29 },
  privacyGlyph: { width: 16, height: 16, textAlign: 'center', textAlignVertical: 'center', borderRadius: 8, overflow: 'hidden', backgroundColor: palette.paleRed, color: palette.red, fontSize: 10, fontWeight: '800' },
  privacyText: { color: palette.muted, fontSize: 10, flex: 1 },
  emptyActivity: { borderRadius: 16, backgroundColor: '#F0F0F0', minHeight: 112, padding: 15, justifyContent: 'center' },
  emptyActivityLine: { width: 22, height: 2, backgroundColor: palette.red, marginBottom: 11 },
  emptyActivityTitle: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  emptyActivityCopy: { color: palette.muted, fontSize: 11, marginTop: 4 },
  refreshButton: { alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 6 },
  refreshText: { color: palette.red, fontSize: 11, fontWeight: '700' },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.paper, borderBottomWidth: 1, borderBottomColor: palette.line, padding: 10 },
  reportPhoto: { borderRadius: 8, width: 64, height: 56, backgroundColor: palette.line },
  reportCard: { borderRadius: 16, overflow: 'hidden', backgroundColor: palette.paper, marginBottom: 8 },
  reportCopy: { flex: 1 },
  reportAside: { alignItems: 'flex-end', justifyContent: 'center', gap: 8, minWidth: 32 },
  reportScore: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  editPanel: { padding: 12 },
  reportFields: { borderRadius: 16, padding: 12, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, marginVertical: 10 },
  reportInputLabel: { color: palette.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginTop: 10, marginBottom: 6 },
  reportInput: { borderWidth: 1, borderColor: palette.line, backgroundColor: palette.white, color: palette.ink, paddingHorizontal: 10, minHeight: 42, fontSize: 14 },
  captionInput: { minHeight: 72, paddingTop: 10, textAlignVertical: 'top' },
  homeFooter: { color: '#93988F', fontSize: 8, fontWeight: '700', letterSpacing: 1.1, textAlign: 'center', marginTop: 25 },
  feedToolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  feedFilters: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  feedFilterButton: { minHeight: 44, maxWidth: '100%', borderRadius: 10, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  feedFilterSelected: { backgroundColor: palette.red, borderColor: palette.red },
  feedFilterText: { color: palette.ink, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  feedFilterTextSelected: { color: palette.white },
  feedReloadButton: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
  communityHeader: { paddingTop: 8, paddingBottom: 27 },
  communityDescription: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 9, maxWidth: 320 },
  communityEmpty: { borderRadius: 16, minHeight: 146, padding: 18, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  communityCard: { borderRadius: 16, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, padding: 12, marginBottom: 12 },
  communityPhoto: { borderRadius: 8, width: '100%', height: 220, backgroundColor: palette.line },
  communityAuthor: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  communityAuthorAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: palette.paleRed, alignItems: 'center', justifyContent: 'center' },
  communityAuthorPhoto: { width: 32, height: 32, resizeMode: 'cover' },
  communityAuthorName: { flex: 1 },
  communityPhotoContainer: { position: 'relative', marginBottom: 10 },
  communityResultsButton: { minHeight: 44, minWidth: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: palette.white, borderRadius: 10, borderWidth: 1, borderColor: palette.line },
  communityResultsOverlay: { position: 'absolute', top: 8, right: 8, maxWidth: '90%' },
  communityResultsFallback: { alignSelf: 'flex-end', marginBottom: 10 },
  communityResultsText: { color: palette.ink, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  communityCaption: { color: palette.ink, fontSize: 13, marginTop: 8 },
  flagBadge: { color: palette.red, fontSize: 11, fontWeight: '800', marginTop: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  voteButton: { width: 25, height: 25, borderRadius: 19, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  voteButtonSelected: { borderColor: palette.red, backgroundColor: palette.paleRed },
  voteArrow: { color: palette.ink, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  voteArrowSelected: { color: palette.red, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  communityScore: { color: palette.ink, fontSize: 14, fontWeight: '800', textAlign: 'center', minWidth: 38 },
  flagAction: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, marginTop: 2 },
  actionSelected: { color: palette.red, fontSize: 11, fontWeight: '800' },
  communityEmptyMark: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.paleRed, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  communityEmptyGlyph: { color: palette.red, fontSize: 24, lineHeight: 28, fontWeight: '300' },
  communitySectionGap: { marginTop: 29 },
  leaderboardLink: { borderRadius: 16, minHeight: 78, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 12 },
  leaderboardLinkIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.paleRed, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  communityLeaderboardIcon: { width: 30, height: 30 },
  leaderboardCopy: { flex: 1 },
  leaderboardTitle: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  leaderboardArrow: { color: palette.red, fontSize: 24, paddingLeft: 8 },
  leaderboardHeader: { paddingTop: 8, paddingBottom: 23 },
  leaderboardPageTitle: { color: palette.ink, fontSize: 34, lineHeight: 40, marginTop: 13 },
  leaderboardPanel: { borderRadius: 16, backgroundColor: '#AAB07A', padding: 14, marginBottom: 28 },
  leaderboardFilters: { borderRadius: 8, flexDirection: 'row', padding: 3, backgroundColor: 'rgba(255,255,255,0.55)', marginBottom: 20 },
  leaderboardFilter: { borderRadius: 8, flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  leaderboardFilterSelected: { backgroundColor: palette.black },
  leaderboardFilterIcon: { width: 25, height: 25 },
  leaderboardFilterText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  leaderboardFilterTextSelected: { color: palette.white },
  leaderboardPeriodHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  leaderboardPeriodIcon: { width: 42, height: 42 },
  leaderboardRow: { borderRadius: 8, minHeight: 76, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, borderBottomWidth: 1, borderBottomColor: palette.line, paddingHorizontal: 11, gap: 9 },
  leaderboardRank: { width: 23, color: palette.red, fontSize: 17 },
  leaderboardAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  leaderboardAvatarText: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  leaderboardDetails: { flex: 1, minWidth: 0 },
  leaderboardName: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  winnerBadge: { borderRadius: 8, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, backgroundColor: '#AAB07A', paddingHorizontal: 6, paddingVertical: 3, marginTop: 5 },
  badgeIconSlot: { borderWidth: 1, borderColor: '#858B5A', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' },
  winnerBadgeText: { color: palette.ink, fontSize: 7, fontWeight: '900', letterSpacing: 0.4 },
  leaderboardCount: { minWidth: 42, alignItems: 'flex-end' },
  leaderboardCountValue: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  leaderboardCountLabel: { color: palette.muted, fontSize: 7, fontWeight: '800', letterSpacing: 0.7, marginTop: 1 },
  leaderboardEmptyState: { borderRadius: 16, minHeight: 210, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, padding: 22 },
  leaderboardEmptyIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.paleRed, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  leaderboardEmptyTitle: { color: palette.ink, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  leaderboardEmptyCopy: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  leaderboardEmptyNote: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 12 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  profileTitle: { color: palette.ink, fontSize: 34, marginBottom: 22 },
  profileIdentity: { alignItems: 'center', gap: 12, paddingVertical: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line, marginBottom: 28 },
  profileAvatar: { width: 100, height: 100, borderRadius: 50, overflow: 'hidden', backgroundColor: palette.black, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  profileAvatarImage: { width: 100, height: 100 },
  profileAvatarText: { color: palette.red, fontSize: 36, fontWeight: '700' },
  profilePhotoButton: { width: 112, height: 112 },
  profilePhotoBadge: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: palette.red, borderWidth: 2, borderColor: palette.background, alignItems: 'center', justifyContent: 'center' },
  profilePhotoHint: { color: palette.muted, fontSize: 11, marginTop: -20, marginBottom: 28 },
  profileIdentityCopy: { alignItems: 'center', width: '100%', maxWidth: 320 },
  profileNameButton: { alignItems: 'center', justifyContent: 'center', minHeight: 34, maxWidth: '100%' },
  profileName: { color: palette.ink, fontSize: 22, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  profileNamePenButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  profileNamePen: { width: 21, height: 21, borderRadius: 11, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center' },
  profileNameInput: { width: '100%', height: 44, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.white, paddingHorizontal: 10, color: palette.ink, fontSize: 16, textAlign: 'center' },
  profileModeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 5 },
  profileMode: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, textAlign: 'center' },
  nameMessage: { color: palette.muted, fontSize: 11, marginTop: 9 },
  nameActions: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  nameActionButton: { minHeight: 38, minWidth: 68, backgroundColor: palette.black, alignItems: 'center', justifyContent: 'center' },
  nameCancelButton: { minHeight: 38, minWidth: 68, alignItems: 'center', justifyContent: 'center' },
  nameCancelText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  nameSaveText: { color: palette.white, fontSize: 12, fontWeight: '700' },
  profileStats: { borderRadius: 16, backgroundColor: palette.paper, marginTop: 11, paddingHorizontal: 14 },
  profileStatRow: { minHeight: 50, borderBottomWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileStatLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  profileStatValue: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  badgesEyebrow: { marginTop: 28 },
  badgeRow: { borderRadius: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, padding: 13, marginTop: 11, borderWidth: 1, borderColor: palette.line },
  badgePreviewRow: { borderRadius: 16, minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.paper, paddingHorizontal: 11, paddingVertical: 8, marginTop: 8, borderWidth: 1, borderColor: palette.line },
  badgeSeal: { width: 39, height: 39, borderRadius: 20, backgroundColor: palette.paleRed, alignItems: 'center', justifyContent: 'center' },
  badgeSealText: { color: palette.red, fontSize: 10, fontWeight: '800' },
  badgeCopy: { flex: 1, paddingHorizontal: 11 },
  badgeTitle: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  badgeDescription: { color: palette.muted, fontSize: 10, marginTop: 4 },
  badgeLocked: { color: '#A1A59B', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  accountNote: { borderRadius: 16, marginTop: 23, padding: 14, backgroundColor: '#F0F0F0' },
  accountNoteTitle: { color: palette.red, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  accountNoteText: { color: '#555555', fontSize: 11, lineHeight: 17, marginTop: 6 },
  signOutButton: { minHeight: 48, borderWidth: 1, borderColor: palette.red, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  signOutText: { color: palette.red, fontSize: 13, fontWeight: '700' },
});
