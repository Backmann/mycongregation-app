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
 * READ AT A GLANCE (25 September, Lionel: the sheet should read easily, above
 * all its main parts). The part is the largest line, the person the next and
 * in the colour of the section, the time and length quiet on the left; the
 * sections are bands across the card, as on the printed sheet; nothing a
 * person has to read is smaller than 14 points or grey.
 *
 * No words of their own: labels arrive from the caller or from translations,
 * so the hard-coded-text check has nothing to find.
 */

const INK = '#0f172a';
const MUTE = '#475569';
const SOFT = '#64748b';
const TIME = '#334155';
const ACC = '#0369a1';
const ACC_BG = '#e0f2fe';
/** The meeting's own colour (lib/section-colors.ts), a shade darker for an icon. */
const CHAIR = '#b45309';
const CHAIR_BG = '#fef3c7';
const CHAIR_ROW = '#fffbeb';
const NUM = { fontVariant: ['tabular-nums' as const] };
/** The card's own side padding — a band reaches past it to both edges. */
export const SHEET_PAD = 14;

/** A section of the meeting — a band of its colour across the card. */
export function SectionChip({ label, color }: { label: string; color: string; soft?: string }) {
  return (
    <View style={[styles.band, { backgroundColor: color }]}>
      <Text style={styles.bandText}>{label}</Text>
    </View>
  );
}

/** A song — punctuation between parts, so it is quiet and carries no person column. */
export function SongLine({ time, text }: { time?: string | null; text: string }) {
  return (
    <View style={styles.songRow}>
      <Text style={[styles.time, NUM]}>{time ?? ''}</Text>
      <Ionicons name="musical-notes-outline" size={14} color={SOFT} />
      <Text style={styles.songText}>{text}</Text>
    </View>
  );
}

/**
 * A prayer — its song and name small, the brother who prays on a line of his
 * own: the chairman announces him, so he is read, not skimmed.
 */
export function PrayerLine({
  time,
  label,
  name,
  mine,
}: {
  time?: string | null;
  label: string;
  name?: string | null;
  mine?: boolean;
}) {
  return (
    <View style={styles.partRow}>
      <Text style={[styles.time, NUM]}>{time ?? ''}</Text>
      <View style={styles.partBody}>
        <Text style={styles.prayerLabel}>{label}</Text>
        <View style={styles.stackedPerson}>
          <Person name={name} mine={mine} left />
        </View>
      </View>
    </View>
  );
}

/** The second person of a part — an assistant or a reader — and whether it is you. */
export type Helper = { label: string; name?: string | null; mine?: boolean };

/**
 * The viewer's own name, set apart — instead of «Вы» (Lionel, 26 September).
 * The sheet is read on a shared tablet on the platform, and sometimes under
 * someone else's account; «Вы» there names the wrong person, a name never
 * does. The mark keeps what «Вы» was for: yours is seen at a glance.
 */
function MeChip({ name, small, right }: { name?: string | null; small?: boolean; right?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.me, small && styles.meSmall, right && styles.meRight]}>
      <Ionicons name="person" size={small ? 12 : 14} color={ACC} />
      <Text style={[styles.meText, small && styles.meTextSmall]}>{name || t('feed.you')}</Text>
    </View>
  );
}

/**
 * Who takes a part: «You» as a mark, a name, or a plain «not assigned»; under
 * it, quieter, the one who helps («Помощник: …»). Each line answers for its
 * own person — «You» on the helper's line when you help, never in the place
 * of the one who takes the part.
 */
function Person({
  name,
  extra,
  helper,
  mine,
  left,
  tone = INK,
}: {
  name?: string | null;
  extra?: string | null;
  helper?: Helper | null;
  mine?: boolean;
  /** Under the title on a narrow screen, so read from the left. */
  left?: boolean;
  /** The section's colour. */
  tone?: string;
}) {
  const { t } = useTranslation();
  const align = left ? styles.alignLeft : null;
  const col = left ? styles.personColLeft : styles.personCol;
  const main = mine ? (
    <MeChip name={name} right={!left} />
  ) : name ? (
    <Text style={[styles.person, { color: tone }, align]}>{name}</Text>
  ) : (
    <Text style={[styles.nobody, align]}>{t('feed.unassigned')}</Text>
  );
  return (
    <View style={col}>
      {main}
      {extra ? <Text style={[styles.personExtra, align]}>{extra}</Text> : null}
      {helper ? (
        <View style={[styles.helperRow, left ? null : styles.helperRowRight]}>
          <Text style={styles.helperLabel}>{`${helper.label}:`}</Text>
          {helper.mine ? (
            <MeChip name={helper.name} small />
          ) : (
            <Text style={[styles.helperName, align]}>{helper.name ?? t('feed.unassigned')}</Text>
          )}
        </View>
      ) : null}
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

/** When a part starts, and how long it is — the left column. */
function When({ time, minutes }: { time?: string | null; minutes?: string | null }) {
  return (
    <View style={styles.when}>
      <Text style={[styles.time, NUM]}>{time ?? ''}</Text>
      {minutes ? <Text style={[styles.minutes, NUM]}>{minutes}</Text> : null}
    </View>
  );
}

/** One part: the time, what it is, and who. */
export function PartLine({
  time,
  minutes,
  title,
  subtitle,
  name,
  extra,
  helper,
  mine,
  tone,
}: {
  time?: string | null;
  /** «10 мин» — under the time. */
  minutes?: string | null;
  title: string;
  subtitle?: string | null;
  name?: string | null;
  extra?: string | null;
  helper?: Helper | null;
  mine?: boolean;
  tone?: string;
}) {
  const { width } = useWindowDimensions();
  if (width < STACK_BELOW) {
    return (
      <View style={styles.partRow}>
        <When time={time} minutes={minutes} />
        <View style={styles.partBody}>
          <Text style={styles.partTitle}>{title}</Text>
          {subtitle ? <Text style={styles.partSub}>{subtitle}</Text> : null}
          <View style={styles.stackedPerson}>
            <Person name={name} extra={extra} helper={helper} mine={mine} tone={tone} left />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.partRow}>
      <When time={time} minutes={minutes} />
      <View style={styles.partBody}>
        <Text style={styles.partTitle}>{title}</Text>
        {subtitle ? <Text style={styles.partSub}>{subtitle}</Text> : null}
      </View>
      <View style={styles.personSlot}>
        <Person name={name} extra={extra} helper={helper} mine={mine} tone={tone} />
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
  tone,
}: {
  label: string;
  name?: string | null;
  extra?: string | null;
  mine?: boolean;
  tone?: string;
}) {
  return (
    <View style={styles.pairRow}>
      <Text style={styles.pairLabel}>{label}</Text>
      <View style={styles.pairPerson}>
        <Person name={name} extra={extra} mine={mine} tone={tone} />
      </View>
    </View>
  );
}

/**
 * Who chairs the meeting — the head of the programme, set apart from the
 * parts below it: he opens, links and closes the whole meeting rather than
 * taking one part of it. The label comes from the caller.
 */
export function ChairLine({
  label,
  name,
  mine,
}: {
  label: string;
  name?: string | null;
  mine?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.chairRow}>
      <View style={styles.chairIcon}>
        <Ionicons name="mic-outline" size={17} color={CHAIR} />
      </View>
      <View style={styles.chairBody}>
        <Text style={styles.chairLabel}>{label}</Text>
        {mine ? (
          <View style={styles.chairMe}>
            <MeChip name={name} />
          </View>
        ) : name ? (
          <Text style={styles.chairName}>{name}</Text>
        ) : (
          <Text style={styles.nobodyLeft}>{t('feed.unassigned')}</Text>
        )}
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
  band: { marginHorizontal: -SHEET_PAD, marginTop: 10, marginBottom: 2, paddingHorizontal: SHEET_PAD, paddingVertical: 8 },
  bandText: {
    fontSize: 13,
    fontFamily: FONT.extrabold,
    letterSpacing: 0.6,
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  songText: { fontSize: 14, fontFamily: FONT.semibold, color: MUTE, flexShrink: 1 },
  when: { width: 48 },
  time: { width: 48, fontSize: 14, fontFamily: FONT.bold, color: TIME },
  minutes: { fontSize: 12, fontFamily: FONT.semibold, color: SOFT, marginTop: 1 },
  partRow: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  partBody: { flex: 1, minWidth: 0 },
  partTitle: { fontSize: 17, lineHeight: 22, fontFamily: FONT.bold, color: INK },
  partSub: { fontSize: 14, fontFamily: FONT.medium, color: MUTE, marginTop: 2 },
  prayerLabel: { fontSize: 14, fontFamily: FONT.semibold, color: MUTE },
  personSlot: { width: 140, alignItems: 'flex-end' },
  personCol: { alignItems: 'flex-end' },
  personColLeft: { alignItems: 'flex-start' },
  stackedPerson: { marginTop: 4, flexDirection: 'row' },
  alignLeft: { textAlign: 'left' },
  person: { fontSize: 16, lineHeight: 21, fontFamily: FONT.bold, color: INK, textAlign: 'right' },
  personExtra: { fontSize: 14, fontFamily: FONT.medium, color: MUTE, textAlign: 'right', marginTop: 2 },
  me: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: ACC_BG,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  meRight: { alignSelf: 'flex-end' },
  meSmall: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, gap: 4 },
  meText: { fontSize: 16, lineHeight: 21, fontFamily: FONT.extrabold, color: ACC },
  meTextSmall: { fontSize: 14, lineHeight: 19 },
  chairMe: { marginTop: 2, flexDirection: 'row' },
  nobody: { fontSize: 15, fontFamily: FONT.medium, color: SOFT, textAlign: 'right' },
  helperRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  helperRowRight: { justifyContent: 'flex-end' },
  helperLabel: { fontSize: 14, fontFamily: FONT.medium, color: SOFT },
  helperName: { fontSize: 15, fontFamily: FONT.semibold, color: MUTE },
  nobodyLeft: { fontSize: 15, fontFamily: FONT.medium, color: SOFT },
  pairRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 8 },
  pairLabel: { fontSize: 14, fontFamily: FONT.semibold, color: SOFT, flexShrink: 1 },
  pairPerson: { alignItems: 'flex-end', maxWidth: '62%' },
  chairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: -SHEET_PAD,
    marginTop: -6,
    marginBottom: 4,
    paddingHorizontal: SHEET_PAD,
    paddingVertical: 12,
    backgroundColor: CHAIR_ROW,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  chairIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: CHAIR_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chairBody: { flex: 1, minWidth: 0 },
  chairLabel: {
    fontSize: 12,
    fontFamily: FONT.bold,
    letterSpacing: 0.5,
    color: '#92400e',
    textTransform: 'uppercase',
  },
  chairName: { fontSize: 17, lineHeight: 22, fontFamily: FONT.extrabold, color: INK, marginTop: 1 },
  topic: { paddingTop: 10, paddingBottom: 6 },
  topicMeta: { fontSize: 13, fontFamily: FONT.bold, color: TIME },
  topicTitle: { fontSize: 20, lineHeight: 26, fontFamily: FONT.extrabold, color: INK, letterSpacing: -0.2, marginTop: 4 },
  topicPeople: { marginTop: 6 },
});
