import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { splitTopic } from '../lib/field-topic';
import { FieldCancelled, FieldNotice } from './FieldNotice';
import { MyDot } from './MyDot';
import { SourceLink } from './SourceLink';

/**
 * ONE field-service meeting, read the same wherever it is drawn (variant A,
 * 14 October 2026). Until now every screen had its own: Home put the address
 * above the conductor and the conductor in a green chip, the month page had
 * him as a plain line, the open day of the Programme said «Ведущий: …» last,
 * and under all of them four to six grey lines of one size ran together —
 * conductor, theme, «Длительность», address, link — so that nothing stood
 * out (Lionel, 14 October: «всё сливается»).
 *
 * The order, everywhere:
 *   time · WHAT meeting                     — the one strong line
 *   who leads it                            — with a person mark, the name darker
 *   what is different this time             — amber, only when there is something
 *   what it is about                        — whole, upright, readable
 *   where · how long · the material         — one quiet line with marks
 *
 * A meeting called off keeps its line, crossed out, with the reason in red,
 * and says nothing else (13 October 2026).
 *
 * `time`: in its own column (lists), in the title line (narrow phones and
 * the open day, where the date column already takes the room), or not at
 * all (the caller says it). `wide`: on a big screen the people and the place
 * stand in a column of their own at the right instead of under the theme.
 */
export type FieldWho =
  | { kind: 'name'; name: string }
  | { kind: 'mine' }
  | { kind: 'empty' }
  | null;

export type FieldHelper = { label: string; name: string; mine: boolean };

export function FieldMeetingBlock({
  time,
  timeLayout = 'column',
  title,
  badges,
  who,
  helpers,
  notice,
  cancelled,
  cancelReason,
  topic,
  place,
  sourceUrl,
  note,
  wide,
  big,
  trailing,
}: {
  time?: string | null;
  timeLayout?: 'column' | 'inline' | 'none';
  title?: string | null;
  /** Small marks after the title: the visit, the draft. */
  badges?: ReactNode;
  who?: FieldWho;
  /** On a visit: the service overseer and his assistant, when not the conductor. */
  helpers?: FieldHelper[];
  notice?: string | null;
  cancelled?: boolean;
  cancelReason?: string | null;
  topic?: string | null;
  place?: string | null;
  sourceUrl?: string | null;
  /** Said to this reader only: «не для вашей группы», «ваша группа — на посещении». */
  note?: string | null;
  wide?: boolean;
  /** The nearest meeting on Home: the notice a size larger. */
  big?: boolean;
  trailing?: ReactNode;
}) {
  const { text: theme, length } = splitTopic(topic);
  const off = !!cancelled;
  const showTimeColumn = timeLayout === 'column' && !!time;
  const inlineTime = timeLayout === 'inline' && time ? time : null;

  const titleLine =
    title || inlineTime ? (
      <View style={styles.titleLine}>
        <Text style={[styles.title, off && styles.struck]}>
          {inlineTime ? <Text style={styles.titleTime}>{`${inlineTime}  `}</Text> : null}
          {title}
        </Text>
        {badges}
      </View>
    ) : null;

  const people = off ? null : (
    <>
      {who ? <WhoLine who={who} /> : null}
      {helpers?.map((h) => (
        <View key={`${h.label}|${h.name}`} style={styles.whoRow}>
          <Ionicons name="walk-outline" size={14} color={h.mine ? GREEN : MUTED} />
          <Text style={styles.whoText}>
            <Text style={[styles.whoLabel, h.mine && styles.mineText]}>{`${h.label} `}</Text>
            <Text style={[styles.whoName, h.mine && styles.mineText]}>{h.name}</Text>
          </Text>
        </View>
      ))}
    </>
  );

  const meta = (
    <MetaLine
      place={place}
      length={off ? null : length}
      sourceUrl={off ? null : sourceUrl}
      struck={off}
      column={wide}
    />
  );

  const status = off ? (
    <FieldCancelled reason={cancelReason} big={big} />
  ) : (
    <FieldNotice text={notice} big={big} />
  );
  const about = !off && theme ? <Text style={styles.topic}>{theme}</Text> : null;
  const noteLine = !off && note ? <Text style={styles.note}>{note}</Text> : null;

  return (
    <View style={styles.row}>
      {showTimeColumn ? <Text style={[styles.time, off && styles.struck]}>{time}</Text> : null}
      {wide ? (
        <View style={styles.wideBody}>
          <View style={styles.wideMain}>
            {titleLine}
            {status}
            {about}
            {noteLine}
          </View>
          <View style={styles.wideSide}>
            {people}
            {meta}
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          {titleLine}
          {people}
          {status}
          {about}
          {meta}
          {noteLine}
        </View>
      )}
      {trailing}
    </View>
  );
}

/** «Ведёт Шмидт Пауль» with a person mark; yours, in green; nobody, in amber. */
export function WhoLine({ who }: { who: Exclude<FieldWho, null> }) {
  const { t } = useTranslation();
  if (who.kind === 'mine') {
    return (
      <View style={styles.whoRow}>
        <MyDot kind="field_service" size={7} />
        <Text style={[styles.whoName, styles.mineText]}>{t('fieldService.row.youLead')}</Text>
      </View>
    );
  }
  if (who.kind === 'empty') {
    return (
      <View style={styles.whoRow}>
        <Ionicons name="person-outline" size={14} color={AMBER} />
        <Text style={[styles.whoName, styles.emptyText]}>{t('fieldService.row.unassigned')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.whoRow}>
      <Ionicons name="person-outline" size={14} color={MUTED} />
      <Text style={styles.whoText}>
        <Text style={styles.whoLabel}>{`${t('fieldService.row.leadsWord')} `}</Text>
        <Text style={styles.whoName}>{who.name}</Text>
      </Text>
    </View>
  );
}

/** Where · how long · the material — one quiet line, each with its mark. */
export function MetaLine({
  place,
  length,
  sourceUrl,
  struck,
  column,
}: {
  place?: string | null;
  length?: string | null;
  sourceUrl?: string | null;
  struck?: boolean;
  column?: boolean;
}) {
  if (!place && !length && !sourceUrl) return null;
  return (
    <View style={[styles.meta, column && styles.metaColumn]}>
      {place ? (
        <View style={styles.metaItem}>
          <Ionicons name="location-outline" size={13} color={MUTED} />
          <Text style={[styles.metaText, struck && styles.struck]}>{place}</Text>
        </View>
      ) : null}
      {length ? (
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={13} color={MUTED} />
          <Text style={styles.metaText}>{length}</Text>
        </View>
      ) : null}
      <SourceLink url={sourceUrl} />
    </View>
  );
}

const INK = '#0f172a';
const BODY = '#334155';
const MUTED = '#64748b';
const GREEN = '#15803d';
const AMBER = '#b45309';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // A minimum, not a width: a phone set to large type widens it.
  time: { minWidth: 46, fontSize: 15.5, lineHeight: 21, fontFamily: 'Manrope_800ExtraBold', color: INK },
  body: { flex: 1, minWidth: 0, gap: 5 },
  wideBody: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 20 },
  wideMain: { flex: 1, minWidth: 0, gap: 6, maxWidth: 560 },
  wideSide: { width: 230, gap: 6 },
  titleLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  title: { flexShrink: 1, fontSize: 15.5, lineHeight: 21, fontFamily: 'Manrope_700Bold', color: INK },
  titleTime: { fontFamily: 'Manrope_800ExtraBold', color: INK },
  struck: { textDecorationLine: 'line-through', color: '#94a3b8' },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whoText: { flexShrink: 1, fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 19, color: BODY },
  whoLabel: { fontFamily: 'Manrope_500Medium', color: MUTED },
  whoName: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, lineHeight: 19, color: '#1e293b' },
  mineText: { fontFamily: 'Manrope_700Bold', color: GREEN },
  emptyText: { fontFamily: 'Manrope_700Bold', color: AMBER },
  topic: { fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 20, color: BODY },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 3 },
  metaColumn: { flexDirection: 'column', alignItems: 'flex-start', rowGap: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { flexShrink: 1, fontFamily: 'Manrope_500Medium', fontSize: 12.5, lineHeight: 17, color: MUTED },
  note: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, lineHeight: 17, color: AMBER },
});
