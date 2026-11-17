import { memo, useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../lib/typography';
import type { Report } from '../lib/reports';
import { lanternflyThumbnailFrame } from '../lib/thumbnail-crop';
const palette = { background: '#F5F5F5', paper: '#FFFFFF', ink: '#111111', muted: '#696969', red: '#F72D33', paleRed: '#FDE8E9', line: '#E2E2E2', black: '#111111', white: '#FFFFFF' };

export const FEED_THUMBNAIL_SIZE = 144;

const CommunityPhoto = memo(function CommunityPhoto({ report }: { report: Report }) {
  const uri = report.photo_url!;
  const [photoSize, setPhotoSize] = useState<{ uri: string; width: number; height: number } | null>(null);
  const frame = lanternflyThumbnailFrame(report, FEED_THUMBNAIL_SIZE, photoSize?.uri === uri ? photoSize : null);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const hasBoxes = report.insects.length > 0 || (!report.insects_ready && report.identification?.status === 'detected' && report.identification.detections.length > 0);
  const needsPhotoSize = hasBoxes && !(report.identification?.image_width && report.identification?.image_height);
  useEffect(() => {
    if (!needsPhotoSize) return;
    let active = true;
    Image.getSize(uri, (width, height) => {
      if (active) setPhotoSize({ uri, width, height });
    }, () => {});
    return () => { active = false; };
  }, [uri, needsPhotoSize]);
  return uri !== failedUri ? <Image source={{ uri }} resizeMode="contain"
    style={frame ? [styles.communityCroppedPhoto, frame] : styles.communityPhoto}
    accessibilityLabel={`Sighting by ${report.author_name}`} onError={() => setFailedUri(uri)} /> : (
    <View style={[styles.communityPhoto, styles.communityPhotoUnavailable]}>
      <Text style={styles.communityPhotoUnavailableText}>Photo unavailable</Text>
    </View>
  );
});

function FeedCaption({ caption }: { caption: string }) {
  const [expanded, setExpanded] = useState(false);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const { fontScale } = useWindowDimensions();
  const overflowing = naturalHeight > 36 * fontScale + 1;
  return <View style={styles.communityCaptionContainer}>
    <Text aria-hidden accessible={false} pointerEvents="none" style={[styles.communityCaption, styles.captionMeasurement]}
      onLayout={event => setNaturalHeight(event.nativeEvent.layout.height)}>{caption}</Text>
    <Text testID="feed-caption" numberOfLines={expanded ? undefined : 2} style={styles.communityCaption}>{caption}</Text>
    {overflowing ? <Pressable accessibilityRole="button" aria-expanded={expanded}
      onPress={() => setExpanded(current => !current)} style={styles.captionToggle}>
      <Text style={styles.captionToggleText}>{expanded ? 'Show less' : 'Show more'}</Text>
    </Pressable> : null}
  </View>;
}


export function ReportVoteControls({ report, disabled = false, previewMode = false, onVote }: {
  report: Report; disabled?: boolean; previewMode?: boolean; onVote: (report: Report, value: -1 | 1) => void;
}) {
    if (previewMode || report.workflow_status === 'rejected'
      || (report.workflow_status !== 'published' && report.identification?.status !== 'detected')) return null;
    return <View style={styles.actionRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Upvote report" accessibilityState={{ selected: report.my_vote === 1 }}
        disabled={disabled} onPress={() => onVote(report, 1)} style={[styles.voteButton, report.my_vote === 1 && styles.voteButtonSelected]}>
        <Text style={report.my_vote === 1 ? styles.voteArrowSelected : styles.voteArrow}>↑</Text>
      </Pressable>
      <Text accessibilityLabel={`Score ${report.upvotes - report.downvotes}`} style={styles.communityScore}>{report.upvotes - report.downvotes}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Downvote report" accessibilityState={{ selected: report.my_vote === -1 }}
        disabled={disabled} onPress={() => onVote(report, -1)} style={[styles.voteButton, report.my_vote === -1 && styles.voteButtonSelected]}>
        <Text style={report.my_vote === -1 ? styles.voteArrowSelected : styles.voteArrow}>↓</Text>
      </Pressable>
    </View>;
  }

export function SightingBody({ report, inlineVotes, votes, onOpenPhoto }: {
  report: Report; inlineVotes: boolean; votes: ReactNode; onOpenPhoto: () => void;
}) {
  return <>
          <View style={styles.communityBody}>
            <Pressable accessibilityRole="button" accessibilityLabel={report.photo_url ? `Open photo by ${report.author_name}` : `Open photo results by ${report.author_name}`}
              onPress={onOpenPhoto} style={({ pressed }) => [styles.communityPhotoContainer, pressed && styles.pressed]}>
              {report.photo_url ? <CommunityPhoto report={report} /> : <View style={[styles.communityPhoto, styles.communityPhotoUnavailable]}>
                <Text style={styles.communityPhotoUnavailableText}>Photo unavailable</Text>
              </View>}
            </Pressable>
            <View style={styles.communityDetails}>
              <View>
                {report.caption ? <FeedCaption caption={report.caption} /> : null}
                <Text style={styles.emptyActivityCopy}>Observed {report.observed_on}{report.place_name ? ` · ${report.place_name}` : ''}</Text>
              </View>
              {inlineVotes ? <View style={styles.inlineVoteSlot}>{votes}</View> : null}
            </View>
          </View>
          {!inlineVotes ? <View style={styles.communityFooter}>{votes}</View> : null}
  </>;
}

const styles = StyleSheet.create({
  communityCroppedPhoto: { position: 'absolute' },
  communityPhoto: { width: FEED_THUMBNAIL_SIZE, height: FEED_THUMBNAIL_SIZE },
  communityPhotoUnavailable: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  communityPhotoUnavailableText: { color: palette.muted, fontSize: 11, textAlign: 'center' },
  communityCaptionContainer: { marginTop: 4 },
  communityCaption: { color: palette.ink, fontSize: 13, lineHeight: 18 },
  captionMeasurement: { position: 'absolute', top: 0, left: 0, width: '100%', opacity: 0 },
  captionToggle: { minHeight: 44, minWidth: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  captionToggleText: { color: palette.red, fontSize: 12, fontWeight: '700' },
  actionRow: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  voteButton: { width: 44, height: 44, borderRadius: 19, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  voteButtonSelected: { borderColor: palette.red, backgroundColor: palette.paleRed },
  voteArrowSelected: { color: palette.red, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  voteArrow: { color: palette.ink, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  communityScore: { color: palette.ink, fontSize: 14, fontWeight: '800', textAlign: 'center', minWidth: 30 },
  communityBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  communityPhotoContainer: { width: FEED_THUMBNAIL_SIZE, height: FEED_THUMBNAIL_SIZE, flexShrink: 0, borderRadius: 8, overflow: 'hidden', backgroundColor: palette.background },
  pressed: { opacity: 0.82 },
  communityDetails: { flex: 1, minWidth: 0, minHeight: FEED_THUMBNAIL_SIZE, justifyContent: 'space-between' },
  emptyActivityCopy: { color: palette.muted, fontSize: 11, marginTop: 4 },
  inlineVoteSlot: { marginTop: 8 },
  communityFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 8 },
});
