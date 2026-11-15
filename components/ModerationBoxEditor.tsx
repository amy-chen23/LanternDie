import { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../lib/typography';
import type { AdminInsect } from '../lib/moderation';
import { dragBox, imagePoint, validBox } from '../lib/moderation-geometry';
import type { Box, Point } from '../lib/moderation-geometry';

export function ModerationBoxEditor({ photo, width, height, insects, selected, initialBox, onSave, onCancel }: {
  photo: string; width: number; height: number; insects: AdminInsect[]; selected?: AdminInsect; initialBox?: Box;
  onSave: (box: Box) => void; onCancel: () => void;
}) {
  const initial = initialBox ?? selected?.box;
  const [fields, setFields] = useState<Record<keyof Box, string>>(() => initial
    ? { x: String(initial.x), y: String(initial.y), width: String(initial.width), height: String(initial.height) }
    : { x: '', y: '', width: '', height: '' });
  const [mode, setMode] = useState<'draw' | 'move' | 'resize'>(selected ? 'move' : 'draw');
  const [ready, setReady] = useState(false);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const start = useRef<{ point: Point; box: Box | null; mode: 'draw' | 'move' | 'resize' } | null>(null);
  const draft = Object.values(fields).some(value => !value.trim()) ? null : {
    x: Number(fields.x), y: Number(fields.y), width: Number(fields.width), height: Number(fields.height),
  };
  function setBox(box: Box) { setFields({ x: String(box.x), y: String(box.y), width: String(box.width), height: String(box.height) }); }
  const gesture = useRef({ ready, layout, width, height, mode, draft });
  gesture.current = { ready, layout, width, height, mode, draft };
  const handlers = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => gesture.current.ready && gesture.current.layout.width > 0,
    onMoveShouldSetPanResponder: () => gesture.current.ready && gesture.current.layout.width > 0,
    onPanResponderGrant: event => {
      const { layout, width, height, draft, mode } = gesture.current;
      const point = imagePoint({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }, layout.width, layout.height, width, height);
      start.current = { point, box: draft, mode };
    },
    onPanResponderMove: event => {
      if (!start.current) return;
      const { layout, width, height } = gesture.current;
      const mode = start.current.mode;
      const end = imagePoint({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }, layout.width, layout.height, width, height);
      if (mode !== 'draw' && !validBox(start.current.box, width, height)) return;
      setBox(dragBox(mode, start.current.point, end, start.current.box, width, height));
    },
    onPanResponderRelease: () => { start.current = null; },
    onPanResponderTerminate: () => { start.current = null; },
    onPanResponderTerminationRequest: () => false,
  }).panHandlers, []);
  return <View style={styles.editor}>
    <Text style={styles.heading}>{selected ? 'Correct insect box' : 'Add an insect box'}</Text>
    <Text style={styles.note}>Choose Draw, Move, or Resize, then drag on the photo. You can also enter precise coordinates below.</Text>
    <View style={styles.row}>{(['draw', 'move', 'resize'] as const).map(value => <Pressable key={value} accessibilityRole="button"
      accessibilityState={{ selected: mode === value }} style={[styles.button, mode === value && styles.selected]}
      onPress={() => setMode(value)}><Text>{value === 'draw' ? 'Draw' : value === 'move' ? 'Move' : 'Resize'}</Text></Pressable>)}</View>
    <View {...handlers} onLayout={event => setLayout(event.nativeEvent.layout)} style={{ width: '100%', aspectRatio: width / height, overflow: 'hidden' }}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Image source={{ uri: photo }} resizeMode="stretch" style={StyleSheet.absoluteFill} onLoad={() => setReady(true)} onError={() => setReady(false)} />
        {insects.filter(insect => insect.active && insect.id !== selected?.id).map(insect => <View key={insect.id} style={[styles.box, {
          borderColor: '#777', left: `${insect.box.x / width * 100}%`, top: `${insect.box.y / height * 100}%`,
          width: `${insect.box.width / width * 100}%`, height: `${insect.box.height / height * 100}%`,
        }]} />)}
        {validBox(draft, width, height) ? <View style={[styles.box, {
          left: `${draft.x / width * 100}%`, top: `${draft.y / height * 100}%`, width: `${draft.width / width * 100}%`, height: `${draft.height / height * 100}%`,
        }]} /> : null}
      </View>
    </View>
    <View style={styles.row}>{(['x', 'y', 'width', 'height'] as const).map(key => <View key={key} style={styles.field}>
      <Text style={styles.note}>{key}</Text><TextInput accessibilityLabel={`Box ${key}`} value={fields[key]} keyboardType="numeric"
        onChangeText={value => setFields(current => ({ ...current, [key]: value }))} style={styles.input} />
    </View>)}</View>
    <Text style={styles.note}>Photo: {width} × {height}. Corrected boxes require a fresh alive/dead decision.</Text>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" disabled={!ready || !validBox(draft, width, height)} style={styles.button}
        onPress={() => { if (validBox(draft, width, height)) onSave(draft); }}><Text>Review box change</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.button} onPress={onCancel}><Text>Cancel editing</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  editor: { gap: 12, paddingVertical: 12 }, heading: { fontSize: 17, fontWeight: '700' }, note: { color: '#666', fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { borderRadius: 8, minHeight: 44, padding: 10, borderWidth: 1, borderColor: '#CCC', justifyContent: 'center' },
  selected: { backgroundColor: '#FFF0F0', borderColor: '#F72D33' }, field: { minWidth: 60, flex: 1 }, input: { borderRadius: 8, minHeight: 44, borderWidth: 1, borderColor: '#CCC', padding: 8 },
  box: { position: 'absolute', borderWidth: 2, borderColor: '#F72D33' },
});
