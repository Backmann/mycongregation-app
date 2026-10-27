import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  assignmentsApi,
  dutyPlacesApi,
  type EventType,
  meetingSettingsApi,
  Publisher,
  publishersApi,
  specialEventsApi,
} from '../lib/api';
import { addWeeks, formatDateISO } from '../lib/dates';
import { effectiveVersionFor } from '../lib/meeting-schedule';
import { usePermissions } from '../lib/permissions';
import { useDutiesWeek } from '../lib/useDutiesWeek';
import { autoDutyIdsOf } from '../lib/auto-duty-ids';
import { weekRules } from '../lib/week-rules';
import { capitalizeFirst } from '../lib/relative-time';
import { FONT } from '../lib/typography';
import { DutiesSection } from './DutiesSection';
import { placeKey, virtualDuties } from '../lib/duty-places';

export type DutyMeeting = 'midweek' | 'weekend' | 'memorial';

const atMidnight = (iso: string) => new Date(`${iso}T00:00:00`);

/**
 * The duties of ONE meeting — the same detail the programme screen shows:
 * assign (with the absence and double-booking warnings), add and remove a
 * duty, rename, move and remove a place, the helpers' load, the «auto» badge.
 *
 * The empty sheet is created here, when this meeting is opened by someone who
 * may edit it — and only here. The list of meetings only reads: opening it
 * must not write rows into the database for weeks nobody looked at.
 *
 * The wiring is lib/useDutiesWeek, the «auto» rule lib/auto-duty-ids — both
 * shared with the programme screen.
 */
export function DutiesMeetingEditor({
  weekStartISO,
  meeting,
  dayInHeader = false,
}: {
  weekStartISO: string;
  meeting: DutyMeeting;
  /**
   * The screen's own header already names the day (the phone's
   * «Среда, 28 октября»): the card then says only the time, instead of
   * repeating the day right under it (walk, 27 October 2026). Beside the list
   * on a wide screen there is no such header, and the card keeps the day.
   */
  dayInHeader?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const perms = usePermissions();
  const nextWeekISO = formatDateISO(addWeeks(atMidnight(weekStartISO), 1));
  const {
    dutiesQuery,
    duties: sheetDuties,
    activityById,
    renamePlaceMutation,
    removePlaceMutation,
    generateDutiesMutation,
    assignDutyMutation,
    createCustomDutyMutation,
    removeDutyMutation,
  } = useDutiesWeek(weekStartISO, nextWeekISO);

  const rosterQ = useQuery({ queryKey: ['publishers', 'roster'], queryFn: () => publishersApi.roster() });
  const eventsQ = useQuery({ queryKey: ['special-events', 'all'], queryFn: () => specialEventsApi.list({ all: true }) });
  const settingsQ = useQuery({ queryKey: ['meeting-settings'], queryFn: () => meetingSettingsApi.getOverview() });
  const assignmentsQ = useQuery({
    queryKey: ['assignments', weekStartISO],
    queryFn: () => assignmentsApi.list({ weekStart: weekStartISO, weekEnd: nextWeekISO }),
  });
  const publishersById = new Map<string, Publisher>((rosterQ.data?.data ?? []).map((p) => [p.id, p]));
  const version = effectiveVersionFor(settingsQ.data?.versions, weekStartISO);
  const events = eventsQ.data;
  const rules = useMemo(
    () => weekRules({ weekStartISO, version, events: events ?? [] }),
    [weekStartISO, version, events],
  );
  // The congregation's places for this kind of meeting (27 October 2026). A
  // midweek or weekend meeting nobody has filled yet shows them as they WILL
  // be — nothing is written until the first person is put somewhere.
  const placeKind = meeting === 'midweek' || meeting === 'weekend' ? meeting : null;
  const placesQ = useQuery({
    queryKey: ['duty-places', placeKind],
    queryFn: () => dutyPlacesApi.get(placeKind!),
    enabled: placeKind !== null,
  });
  const templatePlaces = placesQ.data?.places;
  const hasSheet = sheetDuties.some((d) => d.eventType === meeting);
  const duties =
    placeKind && !hasSheet && templatePlaces
      ? [...sheetDuties, ...virtualDuties(templatePlaces, weekStartISO, meeting as EventType)]
      : sheetDuties;
  const templateKeys = useMemo(
    () => (templatePlaces ? new Set(templatePlaces.map(placeKey)) : undefined),
    [templatePlaces],
  );

  const automationOn = settingsQ.data?.congregation.assignmentAutomationEnabled ?? false;
  const autoDutyIds = autoDutyIdsOf(automationOn, assignmentsQ.data?.data ?? [], duties);

  const dateISO = meeting === 'memorial' ? (rules.memorial?.date ?? null) : rules.dateOf(meeting);
  const todayISO = formatDateISO(new Date());
  // A meeting's duties are history from midnight after its day — the server
  // refuses changes then, so they are not offered.
  const locked = !!dateISO && dateISO < todayISO;
  // The Memorial is never «taken away» — it IS the event that takes.
  const held = !rules.congress && (meeting === 'memorial' ? !!rules.memorial : !rules.isTakenAway(meeting));
  const canEdit = perms.canEditDuties && !locked;

  // The Memorial's empty sheet is still cut on opening: its places come from
  // last year's, not from a template. The ordinary meetings wait for their
  // first assignment (above).
  const tried = useRef(false);
  useEffect(() => {
    if (meeting !== 'memorial') return;
    if (!perms.canEditDuties || !held || locked || tried.current) return;
    if (dutiesQuery.isLoading || generateDutiesMutation.isPending) return;
    if (duties.some((d) => d.eventType === meeting)) return;
    tried.current = true;
    generateDutiesMutation.mutate(meeting);
  }, [perms.canEditDuties, held, locked, dutiesQuery.isLoading, generateDutiesMutation, duties, meeting]);

  const time =
    meeting === 'memorial'
      ? (rules.memorial?.time ?? null)
      : ((meeting === 'midweek' ? version?.midweekTime : version?.weekendTime) || '').slice(0, 5) || null;
  const dateLabel = dayInHeader
    ? time
    : dateISO
    ? capitalizeFirst(
        `${atMidnight(dateISO).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}${time ? ` · ${time}` : ''}`,
      )
    : null;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {!held ? (
        <Text style={styles.note}>
          {rules.congress
            ? t('dutiesScreen.congress', { event: t(`specialEvents.types.${rules.congress.type}`) })
            : t('dutiesScreen.notHeld')}
        </Text>
      ) : (
        <View>
          <DutiesSection
            only={meeting}
            dateLabel={dateLabel}
            locked={locked}
            duties={duties}
            autoDutyIds={autoDutyIds}
            publishersById={publishersById}
            canEdit={canEdit}
            pending={
              renamePlaceMutation.isPending ||
              removePlaceMutation.isPending ||
              generateDutiesMutation.isPending ||
              assignDutyMutation.isPending ||
              createCustomDutyMutation.isPending ||
              removeDutyMutation.isPending
            }
            hideHeader
            onGenerate={(eventType) => generateDutiesMutation.mutate(eventType)}
            onAssign={(id, publisherId) =>
              assignDutyMutation.mutate({ id, publisherId, eventType: meeting as EventType })
            }
            onAddCustom={(eventType, customLabel) => createCustomDutyMutation.mutate({ eventType, customLabel })}
            onRemoveDuty={(id) => removeDutyMutation.mutate(id)}
            onRenamePlace={(id, customLabel) => renamePlaceMutation.mutate({ id, customLabel })}
            onRemovePlace={(id) => removePlaceMutation.mutate(id)}
            activityById={activityById}
            weekStartISO={weekStartISO}
            memorialDateISO={rules.memorial?.date}
            templateKeys={templateKeys}
            templatePlaces={templatePlaces}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  note: { fontSize: 15, fontFamily: FONT.medium, color: '#64748b', paddingVertical: 8 },
});
