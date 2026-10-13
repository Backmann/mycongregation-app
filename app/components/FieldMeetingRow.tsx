import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { FieldServiceMeeting, isFieldServiceCancelled, isFieldServiceDraft } from '../lib/api';
import type { FieldNote } from '../lib/field-audience';
import { FieldNoteLine } from './FieldListBits';
import { FieldCancelled, FieldNotice } from './FieldNotice';
import { MyDot } from './MyDot';
import { MyGlowRow } from './MyGlowRow';
import { SourceLink } from './SourceLink';

/**
 * ONE field-service meeting as a line (11 October 2026): the time at the
 * left; whose meeting it is, with the visit and draft marks; who conducts
 * it (and, on a visit, who goes with him); what it is about, whole; where,
 * quieter; the note for this reader; the link to the material.
 *
 * The month page («Служение → Встречи для проповеди») and the week in
 * «Составление программы» draw the same line through this one component,
 * so the two can no longer drift apart — until now the week kept the old
 * card with coloured badges and name chips while the month had moved on.
 *
 * `trailing` is what stands at the right: a chevron where a tap opens the
 * meeting, the pencil and the bin where the week is edited in place.
 */
export function FieldMeetingRow({
  meeting,
  nameOf,
  groupName,
  place,
  note,
  isMine,
  me,
  last,
  onPress,
  trailing,
}: {
  meeting: FieldServiceMeeting;
  nameOf: (id: string | null | undefined) => string | null;
  groupName: (id: string) => string;
  /** The address, resolved against the halls. */
  place: string;
  note: FieldNote;
  /** The reader conducts it, or goes to it as the overseer or his assistant. */
  isMine: boolean;
  me: string | null;
  last?: boolean;
  /** A tap on the line (the planner's month page); none where it is read only. */
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const { t } = useTranslation();
  const m = meeting;
  // Called off: still drawn, crossed out, with the reason in place of the
  // notice — and nobody's glow: it is nobody's Saturday any more.
  const off = isFieldServiceCancelled(m);
  const RowWrap = isMine && !off ? MyGlowRow : View;
  const title = m.serviceGroupId
    ? t('fieldService.row.group', { group: groupName(m.serviceGroupId) })
    : m.isGeneral
      ? t('fieldService.generalBadge')
      : t('fieldService.row.byGroups');

  // The one line under the title: who conducts, or that nobody does yet.
  // The planner reads this to fill the gap, so an empty place is said
  // plainly here — unlike Home and the Programme, which only read.
  const conductor = nameOf(m.conductorPublisherId);
  let who: { text: string; empty: boolean };
  if (!conductor) {
    who = { text: t('fieldService.row.unassigned'), empty: true };
  } else {
    const bits = [t('fieldService.row.leads', { name: conductor })];
    if (m.serviceOverseerVisit) {
      const overseer =
        m.serviceOverseerPublisherId && m.serviceOverseerPublisherId !== m.conductorPublisherId
          ? nameOf(m.serviceOverseerPublisherId)
          : null;
      const assistant =
        m.serviceOverseerAssistantId && m.serviceOverseerAssistantId !== m.conductorPublisherId
          ? nameOf(m.serviceOverseerAssistantId)
          : null;
      if (overseer) bits.push(t('fieldService.row.withOverseer', { name: overseer }));
      if (assistant) bits.push(t('fieldService.row.withAssistant', { name: assistant }));
    }
    who = { text: bits.join(' · '), empty: false };
  }

  const body = (
    <>
      <Text style={[styles.rowTime, off && styles.struck]}>{m.startTime}</Text>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          {isMine && !off && m.conductorPublisherId === me ? <MyDot kind="field_service" /> : null}
          <Text style={[styles.rowTitle, off && styles.struck]}>{title}</Text>
          {m.serviceOverseerVisit ? (
            <View style={styles.visitBadge}>
              <Text style={styles.visitBadgeText}>{t('fieldService.row.visitBadge')}</Text>
            </View>
          ) : null}
          {isFieldServiceDraft(m) ? (
            <View style={styles.draftBadge}>
              <Text style={styles.draftBadgeText}>{t('fieldService.draft.badge')}</Text>
            </View>
          ) : null}
        </View>
        {off ? null : (
          <Text style={[styles.rowWho, who.empty && styles.rowWhoEmpty]}>{who.text}</Text>
        )}
        {/* What is different this time — before the theme and the address,
            which are what the notice usually corrects. A cancelled meeting
            says that instead, and nothing else is different about it. */}
        {off ? <FieldCancelled reason={m.cancelReason} /> : <FieldNotice text={m.notice} />}
        {/* What the meeting is about, whole: it used to share two lines with
            the address and end in «…» — the address is the same every week,
            the theme is what people read (phone, 11 October 2026). */}
        {m.topic ? <Text style={[styles.rowTopic, off && styles.struck]}>{m.topic}</Text> : null}
        {place ? (
          <Text style={[styles.rowMuted, off && styles.struck]} numberOfLines={2}>
            {place}
          </Text>
        ) : null}
        {off ? null : (
          <>
            <FieldNoteLine note={note} groupName={groupName} />
            <SourceLink url={m.sourceUrl} />
          </>
        )}
      </View>
      {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={16} color="#94a3b8" /> : null)}
    </>
  );

  return (
    <RowWrap kind="field_service" style={[styles.row, last && styles.rowLast]}>
      {onPress ? (
        <Pressable style={styles.rowPress} onPress={onPress}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.rowPress}>{body}</View>
      )}
    </RowWrap>
  );
}

const styles = StyleSheet.create({
  row: {
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f6',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  rowLast: { borderBottomWidth: 0 },
  struck: { textDecorationLine: 'line-through', color: '#94a3b8' },
  rowPress: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rowTime: {
    width: 46,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
    color: '#0f172a',
    paddingTop: 1,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  rowWho: { fontSize: 13.5, color: '#334155', fontFamily: 'Manrope_500Medium' },
  rowWhoEmpty: { color: '#a14a00', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  rowMuted: { fontSize: 13, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  rowTopic: { fontSize: 13.5, color: '#334155', fontFamily: 'Manrope_500Medium', marginTop: 2 },
  visitBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#fdf0d9',
  },
  visitBadgeText: { fontSize: 11.5, color: '#7a4a06', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  draftBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  draftBadgeText: { fontSize: 11.5, color: '#475569', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
});
