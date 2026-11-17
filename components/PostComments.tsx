import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Text, TextInput } from '../lib/typography';
import { addComment, cleanComment, deleteComment, loadComments, type PostComment } from '../lib/comments';

export function PostComments({ reportId, userId, canComment }: {
  reportId: string; userId: string | null; canComment: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PostComment[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const locked = useRef(false);
  const draftId = useRef<string | null>(null);

  useEffect(() => {
    const request = ++generation.current;
    setError('');
    setRows([]);
    setHasMore(false);
    if (!open || !userId) return;
    setLoading(true);
    locked.current = true;
    loadComments(reportId).then(page => {
      if (generation.current === request) { setRows(page.comments); setHasMore(page.hasMore); }
    }).catch(() => {
      if (generation.current === request) setError('Could not load comments. Try refreshing.');
    }).finally(() => {
      if (generation.current === request) { setLoading(false); locked.current = false; }
    });
    return () => { generation.current++; };
  }, [open, userId, reportId, attempt]);

  async function run(action: () => Promise<void>, message: string) {
    if (locked.current) return;
    locked.current = true;
    const request = generation.current;
    setBusy(true);
    setError('');
    try { await action(); } catch {
      if (generation.current === request) setError(message);
    } finally {
      if (generation.current === request) { setBusy(false); locked.current = false; }
    }
  }

  function post() {
    if (!userId || locked.current || !canComment) return;
    let body: string;
    try { body = cleanComment(draft); } catch (e) {
      setError(e instanceof Error ? e.message : 'Write a comment before posting.');
      return;
    }
    const request = generation.current;
    void run(async () => {
      draftId.current ??= Crypto.randomUUID();
      const comment = await addComment(reportId, userId, body, draftId.current);
      if (generation.current !== request) return;
      setRows(current => [comment, ...current.filter(row => row.id !== comment.id)]);
      setDraft('');
      draftId.current = null;
    }, 'Could not post your comment. Your draft is saved here; try again.');
  }

  function remove(id: string) {
    const request = generation.current;
    void run(async () => {
      await deleteComment(id);
      if (generation.current === request) setRows(current => current.filter(row => row.id !== id));
    }, 'Could not delete this comment. Try refreshing.');
  }

  function more() {
    const request = generation.current;
    const before = rows.at(-1);
    if (!before) return;
    void run(async () => {
      const page = await loadComments(reportId, before);
      if (generation.current !== request) return;
      setRows(current => [...current, ...page.comments.filter(row => !current.some(item => item.id === row.id))]);
      setHasMore(page.hasMore);
    }, 'Could not load more comments. Try again.');
  }

  return <View style={styles.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Hide comments' : 'Comments'}
      accessibilityState={{ expanded: open, disabled: busy || loading }} disabled={busy || loading}
      onPress={() => setOpen(value => !value)} style={styles.toggle}>
      <Text style={styles.link}>{open ? 'Hide comments' : 'Comments'}</Text>
    </Pressable>
    {open ? <View style={styles.thread}>
      {!userId ? <Text style={styles.note}>Sign in to view and add comments.</Text> : <>
        <View style={styles.toolbar}>
          <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => setAttempt(value => value + 1)} style={styles.toggle}>
            <Text style={styles.link}>Refresh comments</Text>
          </Pressable>
        </View>
        {loading ? <ActivityIndicator accessibilityLabel="Loading comments" color="#F72D33" /> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!loading && !error && !rows.length ? <Text style={styles.note}>No comments yet.</Text> : null}
        {rows.map(comment => <View key={comment.id} testID={`comment-${comment.id}`} style={styles.comment}>
          <Text style={styles.name}>{comment.author_name}</Text>
          <Text style={styles.note}>{new Date(comment.created_at).toLocaleString()}</Text>
          <Text style={styles.body}>{comment.body}</Text>
          {comment.author_id === userId ? <Pressable accessibilityRole="button" accessibilityLabel="Delete comment" disabled={busy || loading}
            onPress={() => remove(comment.id)} style={styles.toggle}><Text style={styles.link}>Delete</Text></Pressable> : null}
        </View>)}
        {hasMore ? <Pressable accessibilityRole="button" disabled={busy || loading} onPress={more} style={styles.toggle}>
          <Text style={styles.link}>Load more comments</Text>
        </Pressable> : null}
        {canComment ? <View style={styles.form}>
          <TextInput accessibilityLabel="Write a comment" placeholder="Add a comment…" placeholderTextColor="#696969"
            value={draft} multiline maxLength={1000} editable={!busy}
            onChangeText={value => { setDraft(value); draftId.current = null; }} style={styles.input} />
          <Text style={styles.note}>{draft.length}/1000</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Post comment" disabled={busy || loading || !draft.trim()}
            accessibilityState={{ disabled: busy || loading || !draft.trim(), busy }} onPress={post}
            style={[styles.submit, (busy || loading || !draft.trim()) && styles.disabled]}>
            <Text style={styles.submitText}>{busy ? 'Saving…' : 'Post comment'}</Text>
          </Pressable>
        </View> : <Text style={styles.note}>Comments can be added after this post is published.</Text>}
      </>}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 8 },
  toggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { color: '#F72D33', fontSize: 12, fontWeight: '700' },
  thread: { borderTopWidth: 1, borderTopColor: '#E2E2E2', paddingTop: 12, gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  comment: { gap: 6, borderBottomWidth: 1, borderBottomColor: '#E2E2E2', paddingBottom: 8 },
  name: { color: '#111111', fontSize: 13, fontWeight: '700' },
  body: { color: '#111111', fontSize: 14, lineHeight: 20, flexShrink: 1 },
  note: { color: '#696969', fontSize: 11 },
  error: { color: '#F72D33', fontSize: 12 },
  form: { gap: 8 },
  input: { color: '#111111', fontSize: 14, minHeight: 72, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 8, padding: 10, textAlignVertical: 'top' },
  submit: { minHeight: 44, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F72D33', alignSelf: 'flex-start' },
  submitText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
