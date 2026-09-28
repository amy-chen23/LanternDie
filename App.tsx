import 'react-native-url-polyfill/auto';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';
import { House, UserRound, UsersRound } from 'lucide-react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

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

type Screen = 'home' | 'community' | 'profile';
type AuthMode = 'sign-in' | 'sign-up';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [loadingSession, setLoadingSession] = useState(Boolean(supabase));
  const [screen, setScreen] = useState<Screen>('home');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo-library access to choose a lanternfly image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });

    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  async function signOut() {
    if (supabase && session) {
      await supabase.auth.signOut();
    }
    setPreviewMode(false);
    setPhotoUri(null);
    setScreen('home');
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
              email={session?.user.email ?? 'Preview account'}
              previewMode={previewMode}
              photoUri={photoUri}
              onChoosePhoto={choosePhoto}
              onOpenProfile={() => setScreen('profile')}
            />
          ) : screen === 'community' ? (
            <CommunityScreen previewMode={previewMode} />
          ) : (
            <ProfileScreen
              email={session?.user.email ?? 'Preview account'}
              previewMode={previewMode}
              onSignOut={signOut}
            />
          )}
        </View>
        <BottomNavigation activeScreen={screen} onSelect={setScreen} />
      </View>
    </SafeAreaView>
  );
}

function AuthScreen({ onPreview }: { onPreview: () => void }) {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    if (!supabase) {
      setMessage('Add your Supabase URL and anon key to .env to create an account.');
      return;
    }

    setBusy(true);
    const result = mode === 'sign-up'
      ? await supabase.auth.signUp({ email: normalizedEmail, password })
      : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
    } else if (mode === 'sign-up' && !result.data.session) {
      setMessage('Check your inbox to confirm your email, then come back to sign in.');
      setMode('sign-in');
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
            <Text style={styles.brandMark}>LD</Text>
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

            {!hasAuthConfig ? (
              <View style={styles.previewBlock}>
                <Text style={styles.previewNote}>Backend credentials are not set up yet.</Text>
                <Pressable onPress={onPreview} style={styles.previewButton}>
                  <Text style={styles.previewButtonText}>Preview the app</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          <Text style={styles.authFooter}>EMAIL ONLY  /  NO SOCIAL SIGN-IN</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HomeScreen({
  email,
  previewMode,
  photoUri,
  onChoosePhoto,
  onOpenProfile,
}: {
  email: string;
  previewMode: boolean;
  photoUri: string | null;
  onChoosePhoto: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <View style={styles.homeHeader}>
        <View>
          <Text style={styles.eyebrow}>LANTERNDIE  /  FIELD LOG</Text>
          <Text style={styles.greeting}>Good to see you.</Text>
        </View>
        <Pressable accessibilityLabel="Open profile" onPress={onOpenProfile} style={styles.avatarButton}>
          <Text style={styles.avatarText}>{email.slice(0, 1).toUpperCase()}</Text>
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
          <Text style={styles.statLabel}>VERIFIED KILLS</Text>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statFoot}>accepted reports</Text>
        </View>
        <View style={styles.statSeparator} />
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>FIELD POINTS</Text>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statFoot}>earned together</Text>
        </View>
      </View>

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionEyebrow}>ADD TO THE COUNT</Text>
          <Text style={styles.sectionTitle}>Log a lanternfly</Text>
        </View>
        <Text style={styles.sectionIndex}>01 / 03</Text>
      </View>

      <Pressable
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
      </Pressable>
      {photoUri ? (
        <View style={styles.selectedPhotoNotice}>
          <Text style={styles.selectedPhotoTitle}>PHOTO SELECTED</Text>
          <Text style={styles.selectedPhotoCopy}>This preview stays on your device. Upload and verification are not connected yet.</Text>
        </View>
      ) : null}

      <View style={styles.privacyNote}>
        <Text style={styles.privacyGlyph}>i</Text>
        <Text style={styles.privacyText}>Your precise location is not collected by this starter app.</Text>
      </View>

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionEyebrow}>YOUR RECORD</Text>
          <Text style={styles.sectionTitle}>Recent activity</Text>
        </View>
        <Text style={styles.sectionIndex}>02 / 03</Text>
      </View>
      <View style={styles.emptyActivity}>
        <View style={styles.emptyActivityLine} />
        <Text style={styles.emptyActivityTitle}>Nothing logged yet</Text>
        <Text style={styles.emptyActivityCopy}>Your verified reports will appear here.</Text>
      </View>
      <Text style={styles.homeFooter}>A COMMUNITY EFFORT FOR HEALTHIER HABITATS</Text>
    </ScrollView>
  );
}

function CommunityScreen({ previewMode }: { previewMode: boolean }) {
  return (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <View style={styles.communityHeader}>
        <Text style={styles.eyebrow}>LANTERNDIE  /  COMMUNITY</Text>
        <Text style={styles.communityTitle}>Out here, together.</Text>
        <Text style={styles.communityDescription}>
          Verified field reports and friendly competition will live here.
        </Text>
      </View>
      {previewMode ? (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>PREVIEW MODE</Text>
          <Text style={styles.previewBannerDetail}>Community data is not connected yet.</Text>
        </View>
      ) : null}

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionEyebrow}>FROM THE FIELD</Text>
          <Text style={styles.sectionTitle}>Community feed</Text>
        </View>
        <Text style={styles.sectionIndex}>01 / 02</Text>
      </View>
      <View style={styles.communityEmpty}>
        <View style={styles.communityEmptyMark}><Text style={styles.communityEmptyGlyph}>+</Text></View>
        <Text style={styles.emptyActivityTitle}>The field is quiet</Text>
        <Text style={styles.emptyActivityCopy}>Verified community reports will show up here.</Text>
      </View>

      <View style={[styles.sectionHeadingRow, styles.communitySectionGap]}>
        <View>
          <Text style={styles.sectionEyebrow}>THIS WEEK</Text>
          <Text style={styles.sectionTitle}>Leaderboard</Text>
        </View>
        <Text style={styles.sectionIndex}>02 / 02</Text>
      </View>
      <View style={styles.leaderboardEmpty}>
        <Text style={styles.leaderboardIndex}>01</Text>
        <View style={styles.leaderboardCopy}>
          <Text style={styles.leaderboardTitle}>Rankings start with verified reports</Text>
          <Text style={styles.emptyActivityCopy}>No scores to show yet.</Text>
        </View>
      </View>
      <Text style={styles.homeFooter}>A COMMUNITY EFFORT FOR HEALTHIER HABITATS</Text>
    </ScrollView>
  );
}

function BottomNavigation({
  activeScreen,
  onSelect,
}: {
  activeScreen: Screen;
  onSelect: (screen: Screen) => void;
}) {
  const tabs = [
    { screen: 'home' as const, label: 'Home', Icon: House },
    { screen: 'community' as const, label: 'Community', Icon: UsersRound },
    { screen: 'profile' as const, label: 'My Profile', Icon: UserRound },
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
            <Icon color={color} size={20} strokeWidth={active ? 2.4 : 1.8} />
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProfileScreen({
  email,
  previewMode,
  onSignOut,
}: {
  email: string;
  previewMode: boolean;
  onSignOut: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <View style={styles.profileHeader}>
        <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
      </View>
      <Text style={styles.profileTitle}>Profile</Text>
      <View style={styles.profileIdentity}>
        <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{email.slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.profileIdentityCopy}>
          <Text style={styles.profileEmail}>{email}</Text>
          <Text style={styles.profileMode}>{previewMode ? 'PREVIEW ACCOUNT' : 'EMAIL ACCOUNT'}</Text>
        </View>
      </View>

      <Text style={styles.sectionEyebrow}>YOUR PROGRESS</Text>
      <View style={styles.profileStats}>
        <ProfileStat label="STREAK" value="0 days" />
        <ProfileStat label="VERIFIED KILLS" value="0" />
        <ProfileStat label="FIELD POINTS" value="0" />
      </View>

      <Text style={[styles.sectionEyebrow, styles.badgesEyebrow]}>BADGES</Text>
      <View style={styles.badgeRow}>
        <View style={styles.badgeSeal}><Text style={styles.badgeSealText}>01</Text></View>
        <View style={styles.badgeCopy}>
          <Text style={styles.badgeTitle}>First report</Text>
          <Text style={styles.badgeDescription}>Log your first verified lanternfly.</Text>
        </View>
        <Text style={styles.badgeLocked}>LOCKED</Text>
      </View>

      <View style={styles.accountNote}>
        <Text style={styles.accountNoteTitle}>ACCOUNT & PRIVACY</Text>
        <Text style={styles.accountNoteText}>Your email is used to sign in. Public profile and location-sharing controls are not connected yet.</Text>
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
  tabBar: { minHeight: 62, flexDirection: 'row', backgroundColor: palette.white, borderTopWidth: 1, borderTopColor: palette.line, paddingHorizontal: 8, paddingTop: 7, paddingBottom: 4 },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 3 },
  tabLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
  tabLabelActive: { color: palette.red, fontWeight: '800' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  loadingText: { marginTop: 14, color: palette.muted, fontSize: 14 },
  authKeyboard: { flex: 1 },
  authScroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 28 },
  authTopline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: palette.black, color: palette.red, fontSize: 12, fontWeight: '800' },
  eyebrow: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  authHero: { paddingTop: 48, paddingBottom: 28 },
  heroKicker: { color: palette.red, fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 12 },
  authTitle: { color: palette.ink, fontSize: 42, lineHeight: 47, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  authDescription: { color: '#565656', fontSize: 15, lineHeight: 23, marginTop: 14, maxWidth: 330 },
  authPanel: { backgroundColor: palette.paper, padding: 18, borderWidth: 1, borderColor: palette.line },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#F1F1F1', padding: 3, marginBottom: 22 },
  modeButton: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  modeButtonActive: { backgroundColor: palette.black },
  modeText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  modeTextActive: { color: palette.white },
  inputLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginTop: 10 },
  input: { height: 48, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 13, color: palette.ink, fontSize: 14, backgroundColor: '#FFF' },
  formMessage: { color: '#B4232A', fontSize: 12, lineHeight: 18, marginTop: 12 },
  primaryButton: { minHeight: 50, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  primaryButtonText: { color: palette.white, fontWeight: '700', fontSize: 14 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.65 },
  previewBlock: { borderTopWidth: 1, borderTopColor: palette.line, marginTop: 18, paddingTop: 14, alignItems: 'center' },
  previewNote: { color: palette.muted, fontSize: 11, textAlign: 'center' },
  previewButton: { paddingVertical: 12, paddingHorizontal: 16 },
  previewButtonText: { color: palette.red, fontSize: 13, fontWeight: '800' },
  authFooter: { color: '#93988F', textAlign: 'center', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 24 },
  pageContent: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 34 },
  homeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  greeting: { color: palette.ink, fontSize: 26, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', marginTop: 5 },
  avatarButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.paleRed, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.red },
  avatarText: { color: palette.red, fontSize: 15, fontWeight: '800' },
  previewBanner: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, backgroundColor: palette.paleRed, borderLeftWidth: 3, borderLeftColor: palette.red, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 14 },
  previewBannerText: { color: palette.red, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  previewBannerDetail: { color: '#555555', fontSize: 10, flexShrink: 1 },
  streakCard: { backgroundColor: palette.black, minHeight: 208, padding: 20, overflow: 'hidden', position: 'relative' },
  streakTopline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakLabel: { color: '#E6E6E6', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  streakDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.red },
  streakNumberRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 16 },
  streakNumber: { color: palette.red, fontSize: 70, lineHeight: 78, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  streakDays: { color: palette.white, fontSize: 11, fontWeight: '800', letterSpacing: 1.8, marginLeft: 10 },
  streakDivider: { height: 1, backgroundColor: '#414141', marginTop: 7, marginBottom: 12 },
  streakBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakPrompt: { color: '#E6E6E6', fontSize: 12 },
  streakMark: { color: '#B8B8B8', fontSize: 10, fontWeight: '700' },
  streakDecor: { position: 'absolute', width: 120, height: 120, borderWidth: 1, borderColor: '#353535', borderRadius: 60, right: -48, top: 48, alignItems: 'center', justifyContent: 'center' },
  streakDecorRing: { width: 82, height: 82, borderWidth: 1, borderColor: '#353535', borderRadius: 41 },
  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, borderBottomWidth: 1, borderColor: palette.line, paddingVertical: 17, marginBottom: 27 },
  statBlock: { flex: 1, paddingHorizontal: 13 },
  statLabel: { color: palette.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  statValue: { color: palette.ink, fontSize: 28, lineHeight: 34, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', marginTop: 5 },
  statFoot: { color: palette.muted, fontSize: 10 },
  statSeparator: { width: 1, height: 46, backgroundColor: palette.line },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 13 },
  sectionEyebrow: { color: palette.red, fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  sectionTitle: { color: palette.ink, fontSize: 21, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', marginTop: 4 },
  sectionIndex: { color: '#888888', fontSize: 9, fontWeight: '700', marginBottom: 3 },
  uploadButton: { minHeight: 86, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, padding: 12, flexDirection: 'row', alignItems: 'center' },
  uploadIcon: { width: 54, height: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paleRed },
  uploadPlus: { color: palette.red, fontSize: 30, lineHeight: 34, fontWeight: '300' },
  photoPreview: { width: 70, height: 58, backgroundColor: palette.line },
  uploadCopy: { flex: 1, paddingHorizontal: 13 },
  uploadTitle: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  uploadSubtitle: { color: palette.muted, fontSize: 10, marginTop: 5 },
  uploadArrow: { color: palette.red, fontSize: 17, fontWeight: '600', paddingHorizontal: 5 },
  selectedPhotoNotice: { backgroundColor: '#F0F0F0', padding: 11, marginTop: 8 },
  selectedPhotoTitle: { color: palette.red, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  selectedPhotoCopy: { color: '#5D665D', fontSize: 11, lineHeight: 16, marginTop: 4 },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 29 },
  privacyGlyph: { width: 16, height: 16, textAlign: 'center', textAlignVertical: 'center', borderRadius: 8, overflow: 'hidden', backgroundColor: palette.paleRed, color: palette.red, fontSize: 10, fontWeight: '800' },
  privacyText: { color: palette.muted, fontSize: 10, flex: 1 },
  emptyActivity: { backgroundColor: '#F0F0F0', minHeight: 112, padding: 15, justifyContent: 'center' },
  emptyActivityLine: { width: 22, height: 2, backgroundColor: palette.red, marginBottom: 11 },
  emptyActivityTitle: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  emptyActivityCopy: { color: palette.muted, fontSize: 11, marginTop: 4 },
  homeFooter: { color: '#93988F', fontSize: 8, fontWeight: '700', letterSpacing: 1.1, textAlign: 'center', marginTop: 25 },
  communityHeader: { paddingTop: 8, paddingBottom: 27 },
  communityTitle: { color: palette.ink, fontSize: 32, lineHeight: 38, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', marginTop: 13 },
  communityDescription: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 9, maxWidth: 320 },
  communityEmpty: { minHeight: 146, padding: 18, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  communityEmptyMark: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.paleRed, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  communityEmptyGlyph: { color: palette.red, fontSize: 24, lineHeight: 28, fontWeight: '300' },
  communitySectionGap: { marginTop: 29 },
  leaderboardEmpty: { minHeight: 78, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 15 },
  leaderboardIndex: { width: 42, color: palette.red, fontSize: 21, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  leaderboardCopy: { flex: 1 },
  leaderboardTitle: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  profileTitle: { color: palette.ink, fontSize: 34, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', marginBottom: 22 },
  profileIdentity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line, marginBottom: 28 },
  profileAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: palette.black, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: palette.red, fontSize: 19, fontWeight: '700' },
  profileIdentityCopy: { flex: 1 },
  profileEmail: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  profileMode: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginTop: 5 },
  profileStats: { backgroundColor: palette.paper, marginTop: 11, paddingHorizontal: 14 },
  profileStatRow: { minHeight: 50, borderBottomWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileStatLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  profileStatValue: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  badgesEyebrow: { marginTop: 28 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, padding: 13, marginTop: 11, borderWidth: 1, borderColor: palette.line },
  badgeSeal: { width: 39, height: 39, borderRadius: 20, backgroundColor: palette.paleRed, alignItems: 'center', justifyContent: 'center' },
  badgeSealText: { color: palette.red, fontSize: 10, fontWeight: '800' },
  badgeCopy: { flex: 1, paddingHorizontal: 11 },
  badgeTitle: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  badgeDescription: { color: palette.muted, fontSize: 10, marginTop: 4 },
  badgeLocked: { color: '#A1A59B', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  accountNote: { marginTop: 23, padding: 14, backgroundColor: '#F0F0F0' },
  accountNoteTitle: { color: palette.red, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  accountNoteText: { color: '#555555', fontSize: 11, lineHeight: 17, marginTop: 6 },
  signOutButton: { minHeight: 48, borderWidth: 1, borderColor: palette.red, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  signOutText: { color: palette.red, fontSize: 13, fontWeight: '700' },
});
