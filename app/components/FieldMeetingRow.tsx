import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { FieldServiceMeeting, isFieldServiceCancelled, isFieldServiceDraft } from '../lib/api';
import type { FieldNote } from '../lib/field-audience';
import { FieldMeetingBlock, type FieldHelper, type FieldWho } from './FieldMeetingBlock';
import { MyGlowRow } from './MyGlowRow';
import { movedDayLabel, movedFromShown } from '../lib/field-moves';
import { formatDateISO } from '../lib/dates';

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
  attention,
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
  /**
   * What went wrong since it was planned, in words — for the planner only
   * (lib/field-attention.ts, 24 October 2026).
   */
  attention?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const m = meeting;
  // Called off: still drawn, crossed out, with the reason in place of the
  // notice — and nobody's glow: it is nobody's Saturday any more.
  const off = isFieldServiceCancelled(m);
  // Moved: said on both days (lib/field-moves.ts).
  const movedFrom = movedFromShown(m, formatDateISO(new Date()));
  const RowWrap = isMine && !off ? MyGlowRow : View;
  const title = m.serviceGroupId
    ? t('fieldService.row.group', { group: groupName(m.serviceGroupId) })
    : m.isGeneral
      ? t('fieldService.generalBadge')
      : t('fieldService.row.byGroups');

  // A narrow phone gives the time column a third of the line: the time
  // goes into the title line there (14 October 2026, 320 points). A wide
  // screen puts the people and the place in a column of their own.
  const narrow = useWindowDimensions().width < 361;
  const [boxWidth, setBoxWidth] = useState(0);
  const wide = boxWidth >= 640;

  const helpers: FieldHelper[] = [];
  if (m.serviceOverseerVisit && !off) {
    if (m.serviceOverseerPublisherId && m.serviceOverseerPublisherId !== m.conductorPublisherId) {
      const name = nameOf(m.serviceOverseerPublisherId);
      if (name) helpers.push({ label: t('fieldService.overseer'), name, mine: m.serviceOverseerPublisherId === me });
    }
    if (m.serviceOverseerAssistantId && m.serviceOverseerAssistantId !== m.conductorPublisherId) {
      const name = nameOf(m.serviceOverseerAssistantId);
      if (name) helpers.push({ label: t('fieldService.overseerAssistant'), name, mine: m.serviceOverseerAssistantId === me });
    }
  }
  const conductor = nameOf(m.conductorPublisherId);
  // The planner reads the empty place to fill it, so it is said plainly
  // here — unlike Home and the Programme, which only read.
  const who: FieldWho = !conductor
    ? { kind: 'empty' }
    : me && m.conductorPublisherId === me
      ? { kind: 'mine' }
      : { kind: 'name', name: conductor };

  const badges = (
    <>
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
    </>
  );
  const noteText =
    note == null
      ? null
      : note.kind === 'notForYourGroup'
        ? t('feed.fieldNotForYourGroup')
        : note.kind === 'awayOnVisit'
          ? t('feed.fieldAwayOnVisit', { group: groupName(note.groupId) })
          : t('feed.fieldOnlyFor', { group: groupName(note.groupId) });

  const body = (
    <FieldMeetingBlock
      time={m.startTime}
      timeLayout={narrow ? 'inline' : 'column'}
      title={title}
      badges={badges}
      who={who}
      helpers={helpers}
      notice={m.notice}
      cancelled={off}
      cancelReason={m.cancelReason}
      movedFrom={movedFrom ? movedDayLabel(movedFrom, i18n.language) : null}
      movedTo={m.movedTo ? movedDayLabel(m.movedTo, i18n.language) : null}
      topic={m.topic}
      place={place}
      sourceUrl={m.sourceUrl}
      note={noteText}
      wide={wide}
      trailing={trailing ?? (onPress ? <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={styles.chev} /> : null)}
    />
  );

  const marked =
    attention && !off ? (
      <>
        {body}
        <View style={styles.attention} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={15} color="#b42318" style={styles.attentionIcon} />
          <Text style={styles.attentionText}>{attention}</Text>
        </View>
      </>
    ) : (
      body
    );

  return (
    <RowWrap
      kind="field_service"
      style={[styles.row, last && styles.rowLast]}
      onLayout={(e: LayoutChangeEvent) => setBoxWidth(e.nativeEvent.layout.width)}
    >
      {onPress ? (
        <Pressable style={styles.rowPress} onPress={onPress}>
          {marked}
        </Pressable>
      ) : (
        <View style={styles.rowPress}>{marked}</View>
      )}
    </RowWrap>
  );
}

const styles = StyleSheet.create({
  row: {
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f6',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  rowPress: { flex: 1 },
  chev: { marginTop: 3 },
  visitBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#fdf0d9',
  },
  visitBadgeText: { fontSize: 11.5, color: '#7a4a06', fontFamily: 'Manrope_700Bold' },
  draftBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  draftBadgeText: { fontSize: 11.5, color: '#475569', fontFamily: 'Manrope_700Bold' },
  attention: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fef3f2',
  },
  attentionIcon: { marginTop: 1 },
  attentionText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#b42318',
    fontFamily: 'Manrope_600SemiBold',
  },
});
