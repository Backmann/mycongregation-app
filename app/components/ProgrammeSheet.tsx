import type { ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { FONT } from '../lib/typography';

/**
 * The pieces a meeting's programme is read from — the reading side only.
 *
 * The schedule screen's AssignmentRow answers an editor's questions (a draft,
 * a change after publishing, an automatic assignment, where to tap); none of
 * that is here. These pieces set down what a reader wants: when, what, who.
 *
 * No words of their own: labels arrive from the caller or from translations,
 * so the hard-coded-text check has nothing to find.
 */

const INK = '#0f172a';
const SOFT = '#64748b';
const ACC = '#0369a1';
const ACC_BG = '#e0f2fe';
const NUM = { fontVariant: ['tabular-nums' as const] };

/** A section of the meeting — a label on its soft tone, not a slab of colour. */
export function SectionChip({ label, color, soft }: { label: string; color: string; soft: string }) {
  return (
    <View style={styles.chipRow}>
      <Text style={[styles.chip, { color, backgroundColor: soft }]}>{label}</Text>
    </View>
  );
}

/** A song — punctuation between parts, so it is quiet and carries no person column. */
export function SongLine({ time, text }: { time?: string | null; text: string }) {
  return (
    <View style={styles.songRow}>
      <Text style={[styles.time, NUM]}>{time ?? ''}</Text>
      <Ionicons name="musical-notes-outline" size={13} color={SOFT} />
      <Text style={styles.songText}>{text}</Text>
    </View>
  );
}

/** Who takes a part: «You» as a mark, a name, or a plain «not assigned». */
function Person({
  name,
  extra,
  mine,
  left,
}: {
  name?: string | null;
  extra?: string | null;
  mine?: boolean;
  /** Under the title on a narrow screen, so read from the left. */
  left?: boolean;
}) {
  const { t } = useTranslation();
  const align = left ? styles.alignLeft : null;
  if (mine) return <Text style={styles.you}>{t('feed.you')}</Text>;
  if (!name) return <Text style={[styles.nobody, align]}>{t('feed.unassigned')}</Text>;
  return (
    <View style={left ? styles.personColLeft : styles.personCol}>
      <Text style={[styles.person, align]}>{name}</Text>
      {extra ? <Text style={[styles.personExtra, align]}>{extra}</Text> : null}
    </View>
  );
}

/**
 * Below this width a title beside a column of names is squeezed into a
 * narrow strip — «Иегова поддерживает тех, кто предан его Царству» took four
 * lines on a phone. There the person goes under the title; the printed
 * sheet's two columns come back where there is room for them.
 */
const STACK_BELOW = 440;

/** One part: the time, what it is, and who — the person on the right. */
export function PartLine({
  time,
  title,
  subtitle,
  name,
  extra,
  mine,
}: {
  time?: string | null;
  title: string;
  subtitle?: string | null;
  name?: string | null;
  extra?: string | null;
  mine?: boolean;
}) {
  const { width } = useWindowDimensions();
  if (width < STACK_BELOW) {
    return (
      <View style={styles.partRow}>
        <Text style={[styles.time, NUM]}>{time ?? ''}</Text>
        <View style={styles.partBody}>
          <Text style={styles.partTitle}>{title}</Text>
          {subtitle ? <Text style={styles.partSub}>{subtitle}</Text> : null}
          <View style={styles.stackedPerson}>
            <Person name={name} extra={extra} mine={mine} left />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.partRow}>
      <Text style={[styles.time, NUM]}>{time ?? ''}</Text>
      <View style={styles.partBody}>
        <Text style={styles.partTitle}>{title}</Text>
        {subtitle ? <Text style={styles.partSub}>{subtitle}</Text> : null}
      </View>
      <View style={styles.personSlot}>
        <Person name={name} extra={extra} mine={mine} />
      </View>
    </View>
  );
}

/** A labelled place and its person — duties, cleaning, a reader, a conductor. */
export function PairLine({
  label,
  name,
  extra,
  mine,
}: {
  label: string;
  name?: string | null;
  extra?: string | null;
  mine?: boolean;
}) {
  return (
    <View style={styles.pairRow}>
      <Text style={styles.pairLabel}>{label}</Text>
      <View style={styles.pairPerson}>
        <Person name={name} extra={extra} mine={mine} />
      </View>
    </View>
  );
}

/**
 * A weekend topic — the talk or the Watchtower article — set large: at the
 * weekend the titles ARE the meeting, and they read as such.
 */
export function Topic({
  meta,
  title,
  children,
}: {
  meta: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.topic}>
      <Text style={[styles.topicMeta, NUM]}>{meta}</Text>
      <Text style={styles.topicTitle}>{title}</Text>
      {children ? <View style={styles.topicPeople}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', marginTop: 16, marginBottom: 4 },
  chip: {
    fontSize: 12,
    fontFamily: FONT.extrabold,
    letterSpacing: 0.3,
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  songText: { fontSize: 13, fontFamily: FONT.medium, color: SOFT, flexShrink: 1 },
  time: { width: 44, fontSize: 13, fontFamily: FONT.semibold, color: SOFT },
  partRow: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  partBody: { flex: 1, minWidth: 0 },
  partTitle: { fontSize: 15, lineHeight: 21, fontFamily: FONT.medium, color: INK },
  partSub: { fontSize: 13, fontFamily: FONT.medium, color: SOFT, marginTop: 1 },
  personSlot: { width: 128, alignItems: 'flex-end' },
  personCol: { alignItems: 'flex-end' },
  personColLeft: { alignItems: 'flex-start' },
  stackedPerson: { marginTop: 3, flexDirection: 'row' },
  alignLeft: { textAlign: 'left' },
  person: { fontSize: 14, lineHeight: 19, fontFamily: FONT.semibold, color: INK, textAlign: 'right' },
  personExtra: { fontSize: 13, fontFamily: FONT.medium, color: SOFT, textAlign: 'right', marginTop: 1 },
  you: {
    fontSize: 14,
    fontFamily: FONT.extrabold,
    color: ACC,
    backgroundColor: ACC_BG,
    borderRadius: 7,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  nobody: { fontSize: 14, fontFamily: FONT.medium, color: SOFT, textAlign: 'right' },
  pairRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  pairLabel: { fontSize: 14, fontFamily: FONT.medium, color: SOFT, flexShrink: 1 },
  pairPerson: { alignItems: 'flex-end', maxWidth: '60%' },
  topic: { paddingTop: 2, paddingBottom: 4 },
  topicMeta: { fontSize: 12, fontFamily: FONT.semibold, color: SOFT },
  topicTitle: { fontSize: 19, lineHeight: 25, fontFamily: FONT.bold, color: INK, letterSpacing: -0.2, marginTop: 3 },
  topicPeople: { marginTop: 8 },
});
