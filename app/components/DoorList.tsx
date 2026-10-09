import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONT } from '../lib/typography';
import { useMayOpen } from '../lib/useMayOpen';

const INK = '#0f172a';
const SOFT = '#64748b';
const LINE = '#eef2f6';

/** One row of a contents screen: a title, a line under it, a screen behind. */
export type Door = { key: string; title: string; subtitle: string; href: string };
/** Doors under one heading; `label: null` draws them with no heading. */
export type DoorSection = { key: string; label: string | null; doors: Door[] };
/** The live line that takes a door's description's place. */
export type DoorLineView = { text: string; due: boolean };

/** Two columns of sections from this width, as on Home. */
const WIDE_FROM = 900;

/**
 * A contents screen — «Собрание» and «Служение» (4 October 2026).
 *
 * The two tabs were built a month apart and looked it: white rows under
 * headings in one, separate cards with icons in the other, and the second
 * said the same words every day. One component now draws both, so a change
 * to a row is a change to every row.
 *
 * A row is named by the title of the screen it opens; under it stands ONE
 * line — the live one where there is something to say, the plain description
 * otherwise — amber only where there is something to do. A section with no
 * doors is not drawn.
 *
 * WHO SEES A DOOR is decided here, for every door at once: a door is drawn
 * for whoever its screen lets in (lib/screen-access), and for nobody else.
 * The screens that hand this list their doors do not repeat that rule — they
 * leave a door out only where it is meant to be narrower than its screen,
 * and say why.
 */
export function DoorList({
  sections,
  lines,
  notice,
}: {
  sections: DoorSection[];
  lines: Record<string, DoorLineView | undefined>;
  /** Above the rows: that some lines did not come (ConnectionState, PartlyShown). */
  notice?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_FROM;

  const mayOpen = useMayOpen();
  const shown = sections
    .map((s) => ({ ...s, doors: s.doors.filter((d) => mayOpen(d.href)) }))
    .filter((s) => s.doors.length > 0);
  const block = (s: DoorSection) => (
    <View key={s.key} style={s.label ? null : styles.unlabelled}>
      {s.label ? (
        <Text style={styles.label} accessibilityRole="header">
          {s.label}
        </Text>
      ) : null}
      {s.doors.map((d) => (
        <Row key={d.key} door={d} line={lines[d.key]} />
      ))}
    </View>
  );
  // On a wide screen the sections stand in two columns, split by rows rather
  // than by count, so neither column runs long.
  const half = (() => {
    const total = shown.reduce((n, s) => n + s.doors.length + 1, 0);
    let acc = 0;
    for (let i = 0; i < shown.length; i++) {
      acc += shown[i].doors.length + 1;
      if (acc >= total / 2) return i + 1;
    }
    return shown.length;
  })();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {notice ? <View style={wide ? styles.noticeWide : styles.column}>{notice}</View> : null}
      {wide && shown.length > 1 ? (
        <View style={styles.wide}>
          <View style={styles.wideCol}>{shown.slice(0, half).map(block)}</View>
          <View style={styles.wideCol}>{shown.slice(half).map(block)}</View>
        </View>
      ) : (
        <View style={styles.column}>{shown.map(block)}</View>
      )}
    </ScrollView>
  );
}

function Row({ door, line }: { door: Door; line?: DoorLineView }) {
  return (
    <Pressable
      onPress={() => router.push(door.href as never)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={door.title}
      accessibilityHint={line?.text ?? door.subtitle}
    >
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {door.title}
        </Text>
        {/* One line: a subtitle that wraps breaks the list's even rhythm.
            The live line takes the description's place; amber only where
            there is something to do. */}
        <Text style={[styles.subtitle, line?.due && styles.due]} numberOfLines={1}>
          {line?.text ?? door.subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720 },
  wide: { width: '100%', maxWidth: 1000, flexDirection: 'row', gap: 32, paddingHorizontal: 8 },
  wideCol: { flex: 1, minWidth: 0 },
  noticeWide: { width: '100%', maxWidth: 1000, paddingHorizontal: 8 },
  due: { color: '#b45309', fontFamily: FONT.bold },
  unlabelled: { paddingTop: 8 },
  label: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
    fontSize: 12,
    fontFamily: FONT.bold,
    letterSpacing: 1.2,
    color: SOFT,
    textTransform: 'uppercase',
  },
  // White rows on the app's grey (28 September): one background for every
  // screen, and the doors still read as one block under their heading.
  row: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  pressed: { backgroundColor: '#f8fafc' },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontFamily: FONT.bold, color: INK },
  subtitle: { fontSize: 14, fontFamily: FONT.medium, color: SOFT, marginTop: 3 },
});
