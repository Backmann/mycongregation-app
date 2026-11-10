import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
 * ONE ROW, ONE SHAPE (the programme redesign, 9 November 2026 — «вариант 5»):
 * the time and length in a column on the left; then what the part is, in the
 * colour of its section, numbered as in the workbook; then who, in black,
 * each person on a line of his own and always under the part — on a phone
 * and on a wide screen alike. A part done by two names the second person on
 * the next line, with what he is («· помощник», «· чтец») after the name.
 * Sections are headed as the workbook heads them: a tinted band, a small
 * square of the section's colour, the name in ordinary letters.
 *
 * No words of their own: labels arrive from the caller or from translations,
 * so the hard-coded-text check has nothing to find.
 */

const INK = '#0f172a';
const MUTE = '#475569';
const SOFT = '#64748b';
const PLAIN = '#334155';
const ACC = '#0369a1';
/** The row of a part that is yours. */
const MINE_BG = '#e0f2fe';
const RULE = '#eef0f3';
const NUM = { fontVariant: ['tabular-nums' as const] };
/** The card's own side padding — a band reaches past it to both edges. */
export const SHEET_PAD = 14;

/** A section of the meeting — the workbook's tinted band across the card. */
export function SectionChip({
  label,
  color,
  soft,
  ink,
  icon,
}: {
  label: string;
  color: string;
  soft?: string;
  /** The words' colour, where `color` is too light to read (the gold). */
  ink?: string;
  icon?: string;
}) {
  return (
    <View style={[styles.band, { backgroundColor: soft ?? '#f1f5f9' }]}>
      <View style={[styles.bandIcon, { backgroundColor: color }]}>
        {icon ? (
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={14} color="#ffffff" />
        ) : null}
      </View>
      <Text style={[styles.bandText, { color: ink ?? color }]}>{label}</Text>
    </View>
  );
}

/** A song — punctuation between parts: a note and its name, no person. */
export function SongLine({ time, text }: { time?: string | null; text: string }) {
  return (
    <View style={styles.partRow}>
      <When time={time} />
      <View style={styles.partBody}>
        <View style={styles.songHead}>
          <Ionicons name="musical-notes-outline" size={15} color={SOFT} style={styles.songIcon} />
          <Text style={styles.plainTitle}>{text}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * A prayer — its song and name, and the brother who prays on a line of his
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
    <View style={[styles.partRow, mine && styles.mineRow]}>
      <When time={time} />
      <View style={styles.partBody}>
        <Text style={styles.plainTitle}>{label}</Text>
        <Person name={name} mine={mine} />
      </View>
    </View>
  );
}

/** The second person of a part — an assistant or a reader — and whether it is you. */
export type Helper = {
  /** What he is, said after his name: «помощник», «чтец». */
  label: string;
  name?: string | null;
  mine?: boolean;
};

/**
 * The viewer's own name, set apart — instead of «Вы» (Lionel, 26 September).
 * The sheet is read on a shared tablet on the platform, and sometimes under
 * someone else's account; «Вы» there names the wrong person, a name never
 * does. The mark keeps what «Вы» was for: yours is seen at a glance.
 */
function MeChip({ name }: { name?: string | null }) {
  const { t } = useTranslation();
  return (
    <View style={styles.me}>
      <View style={styles.meDot}>
        <Ionicons name="person" size={10} color="#ffffff" />
      </View>
      <Text style={styles.meText}>{name || t('feed.you')}</Text>
    </View>
  );
}

/** «не назначен» — a gap to fill, said quietly, not in red. */
function Nobody() {
  const { t } = useTranslation();
  return (
    <View style={styles.nobody}>
      <Text style={styles.nobodyText}>{t('feed.unassigned')}</Text>
    </View>
  );
}

/**
 * Who takes a part, and under him, a line of his own, the one who helps or
 * reads. Each line answers for its own person — the mark of «yours» on the
 * helper's line when you help, never in the place of the one who takes the
 * part (25 September: an assistant once saw «Вы» in the student's place).
 */
function Person({
  name,
  extra,
  helper,
  mine,
}: {
  name?: string | null;
  /** A guest speaker's congregation, after his name. */
  extra?: string | null;
  helper?: Helper | null;
  mine?: boolean;
}) {
  return (
    <View style={styles.people}>
      <View style={styles.personLine}>
        {mine ? <MeChip name={name} /> : name ? <Text style={styles.person}>{name}</Text> : <Nobody />}
        {extra ? <Text style={styles.extra}>{` · ${extra}`}</Text> : null}
      </View>
      {helper ? (
        <View style={styles.personLine}>
          {helper.mine ? (
            <>
              <MeChip name={helper.name} />
              <Text style={styles.role}>{`\u00a0·\u00a0${helper.label}`}</Text>
            </>
          ) : helper.name ? (
            // One text, so the role wraps with the last word of the name and
            // never stands alone on a line (seen in a narrow column, 10
            // November 2026).
            <Text style={styles.helper}>
              {helper.name}
              <Text style={styles.role}>{`\u00a0·\u00a0${helper.label}`}</Text>
            </Text>
          ) : (
            <>
              <Nobody />
              <Text style={styles.role}>{`\u00a0·\u00a0${helper.label}`}</Text>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

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
  number,
  title,
  subtitle,
  name,
  extra,
  helper,
  mine,
  tone,
  below,
  noPerson,
}: {
  time?: string | null;
  /** «10 мин» — under the time. */
  minutes?: string | null;
  /** The part's number in the workbook, before its name. */
  number?: number | null;
  title: string;
  subtitle?: string | null;
  /** Under the subtitle: a field-service meeting's theme and its link. */
  below?: ReactNode;
  name?: string | null;
  extra?: string | null;
  helper?: Helper | null;
  mine?: boolean;
  /** The section's colour: the part's name is written in it. */
  tone?: string;
  /**
   * Nobody to name at all — a field-service meeting called off: «не
   * назначен» under it would read as a gap still to fill.
   */
  noPerson?: boolean;
}) {
  const yours = !!mine || !!helper?.mine;
  return (
    <View style={[styles.partRow, yours && styles.mineRow]}>
      <When time={time} minutes={minutes} />
      <View style={styles.partBody}>
        <Text style={[styles.partTitle, { color: tone ?? INK }]}>
          {number ? `${number}. ${title}` : title}
        </Text>
        {subtitle ? <Text style={styles.partSub}>{subtitle}</Text> : null}
        {below}
        {noPerson ? null : <Person name={name} extra={extra} helper={helper} mine={mine} />}
      </View>
    </View>
  );
}

/** A labelled place and its person — duties, cleaning. */
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
  /** Kept for callers; the person is written in black now. */
  tone?: string;
}) {
  return (
    <View style={[styles.pairRow, mine && styles.mineRow]}>
      <Text style={styles.pairLabel}>{label}</Text>
      <View style={styles.pairPerson}>
        <View style={styles.pairPersonLine}>
          {mine ? <MeChip name={name} /> : name ? <Text style={styles.pairName}>{name}</Text> : <Nobody />}
        </View>
        {extra ? <Text style={styles.pairExtra}>{extra}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Who chairs the meeting — the head of the programme. A row like any other,
 * quiet: he opens, links and closes the whole meeting rather than taking one
 * part of it. The label comes from the caller.
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
  return (
    <View style={[styles.partRow, styles.chairRow, mine && styles.mineRow]}>
      <When />
      <View style={styles.partBody}>
        <Text style={styles.plainTitle}>{label}</Text>
        <Person name={name} mine={mine} />
      </View>
    </View>
  );
}

/**
 * A weekend topic set large — kept for callers outside the feed's sheet; the
 * sheet itself writes the talk and the study as rows like the rest.
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
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: -SHEET_PAD,
    marginTop: 8,
    paddingHorizontal: SHEET_PAD,
    paddingVertical: 9,
  },
  bandIcon: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  bandText: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: FONT.extrabold },
  when: { width: 46 },
  time: { fontSize: 15, lineHeight: 21, fontFamily: FONT.extrabold, color: INK },
  minutes: { fontSize: 12.5, fontFamily: FONT.semibold, color: SOFT, marginTop: 1 },
  partRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 11,
    marginHorizontal: -SHEET_PAD,
    paddingHorizontal: SHEET_PAD,
    borderTopWidth: 1,
    borderTopColor: RULE,
  },
  mineRow: { backgroundColor: MINE_BG, borderTopColor: MINE_BG },
  chairRow: { borderTopWidth: 0 },
  partBody: { flex: 1, minWidth: 0 },
  partTitle: { fontSize: 16, lineHeight: 21, fontFamily: FONT.extrabold },
  partSub: { fontSize: 14, fontFamily: FONT.medium, color: MUTE, marginTop: 2 },
  plainTitle: { flexShrink: 1, fontSize: 15.5, lineHeight: 21, fontFamily: FONT.bold, color: PLAIN },
  songHead: { flexDirection: 'row', alignItems: 'flex-start' },
  songIcon: { marginTop: 3, marginRight: 5 },
  people: { marginTop: 4, gap: 3 },
  personLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  person: { fontSize: 15.5, lineHeight: 21, fontFamily: FONT.bold, color: INK },
  helper: { fontSize: 15, lineHeight: 21, fontFamily: FONT.semibold, color: INK },
  role: { fontSize: 14.5, lineHeight: 21, fontFamily: FONT.semibold, color: SOFT },
  extra: { fontSize: 14.5, lineHeight: 21, fontFamily: FONT.medium, color: SOFT },
  me: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: ACC,
    borderRadius: 999,
    paddingLeft: 3,
    paddingRight: 11,
    paddingVertical: 2,
  },
  meDot: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meText: { fontSize: 15, lineHeight: 20, fontFamily: FONT.bold, color: '#ffffff' },
  nobody: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  nobodyText: { fontSize: 14, lineHeight: 19, fontFamily: FONT.semibold, color: SOFT },
  pairRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 10,
    marginHorizontal: -SHEET_PAD,
    paddingHorizontal: SHEET_PAD,
    borderTopWidth: 1,
    borderTopColor: RULE,
  },
  pairLabel: { fontSize: 14.5, fontFamily: FONT.semibold, color: MUTE, flexShrink: 1 },
  pairPerson: { alignItems: 'flex-end', maxWidth: '62%' },
  pairPersonLine: { flexDirection: 'row' },
  pairName: { fontSize: 15.5, lineHeight: 21, fontFamily: FONT.bold, color: INK, textAlign: 'right' },
  pairExtra: { fontSize: 14, fontFamily: FONT.medium, color: MUTE, textAlign: 'right', marginTop: 2 },
  topic: { paddingTop: 10, paddingBottom: 6 },
  topicMeta: { fontSize: 13, fontFamily: FONT.bold, color: PLAIN },
  topicTitle: { fontSize: 20, lineHeight: 26, fontFamily: FONT.extrabold, color: INK, letterSpacing: -0.2, marginTop: 4 },
  topicPeople: { marginTop: 6 },
});
