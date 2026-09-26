import { Fragment, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FieldServiceMeeting, Publisher } from '../lib/api';
import { fieldNotes, isOnMeeting, type FieldNote } from '../lib/field-audience';
import { useMyPublisher } from '../lib/useMyPublisher';
import { MyDot } from './MyDot';
import { PersonChip } from './PersonChip';

/**
 * What the two LISTS of field-service meetings add for the person reading
 * them (26 September): the «Встречи для проповеди» page and the planning
 * section draw the same rows, and each had to be fixed on its own before.
 *
 * Lists keep every meeting — they are the congregation's plan, and the
 * printed sheet is made from them — so nothing is folded away here as in the
 * Programme feed. They only say, under a meeting, that the reader's group is
 * on a visit that day, or that a visit is another group's.
 */
export function useFieldListViewer(meetings: FieldServiceMeeting[]) {
  const { myPublisherId, myPublisher } = useMyPublisher();
  const myGroupId = myPublisher?.serviceGroupId ?? null;
  const notes = useMemo(
    () => fieldNotes(meetings, myGroupId, myPublisherId ?? null),
    [meetings, myGroupId, myPublisherId],
  );
  return {
    noteOf: (id: string): FieldNote => notes.get(id) ?? null,
    me: myPublisherId ?? null,
    /** Conducts it, or goes to the visit as the overseer or his assistant. */
    isMine: (m: FieldServiceMeeting) => isOnMeeting(m, myPublisherId ?? null),
  };
}

export function FieldNoteLine({
  note,
  groupName,
}: {
  note: FieldNote;
  groupName: (id: string) => string;
}) {
  const { t } = useTranslation();
  if (!note) return null;
  return (
    <Text style={styles.note}>
      {note.kind === 'notForYourGroup'
        ? t('feed.fieldNotForYourGroup')
        : note.kind === 'awayOnVisit'
          ? t('feed.fieldAwayOnVisit', { group: groupName(note.groupId) })
          : t('feed.fieldOnlyFor', { group: groupName(note.groupId) })}
    </Text>
  );
}

/**
 * The overseer and his assistant on a visit, whoever of them does not
 * already stand there as the conductor. The lists named the conductor only:
 * the assistant was stored, printed and shown in the feed but not here, and
 * when the assistant conducted, the overseer — the one the group is waiting
 * for — was not named at all.
 */
export function VisitPeopleChips({
  meeting,
  publishersById,
  me,
}: {
  meeting: FieldServiceMeeting;
  publishersById: Map<string, Publisher>;
  me: string | null;
}) {
  const { t } = useTranslation();
  if (!meeting.serviceOverseerVisit) return null;
  const chip = (id: string | null, label: string) => {
    if (!id || id === meeting.conductorPublisherId) return null;
    const p = publishersById.get(id);
    if (!p) return null;
    return (
      <Fragment key={id}>
        {id === me ? <MyDot kind="field_service" /> : null}
        <PersonChip label={`${label}: ${p.displayName}`} variant="assistant" />
      </Fragment>
    );
  };
  return (
    <>
      {chip(meeting.serviceOverseerPublisherId, t('fieldService.overseer'))}
      {chip(meeting.serviceOverseerAssistantId, t('fieldService.overseerAssistant'))}
    </>
  );
}

const styles = StyleSheet.create({
  note: {
    fontSize: 12.5,
    color: '#b45309',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    marginTop: 2,
  },
});
