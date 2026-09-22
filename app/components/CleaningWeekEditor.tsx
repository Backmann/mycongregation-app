import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { meetingSettingsApi, Publisher, publishersApi, specialEventsApi } from '../lib/api';
import { effectiveVersionFor } from '../lib/meeting-schedule';
import { usePermissions } from '../lib/permissions';
import { useCleaningWeek } from '../lib/useCleaningWeek';
import { weekRules } from '../lib/week-rules';
import { FONT } from '../lib/typography';
import { CleaningSection } from './CleaningSection';
import { UndoBar } from './UndoBar';

/**
 * One week's cleaning, editable by whoever may edit it — the SAME detail the
 * programme screen showed: assign and clear a group (with undo), the hint of
 * who is next in turn, the windows and the day of the weekly cleaning (the
 * group's overseer may set the day himself), the general cleaning.
 *
 * The wiring is lib/useCleaningWeek, shared with the programme screen.
 */
export function CleaningWeekEditor({ weekStartISO }: { weekStartISO: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const perms = usePermissions();
  const {
    cleaningQuery,
    cleaningWeek,
    setCleaningSlotMutation,
    clearedSlot,
    setClearedSlot,
    clearCleaningSlotMutation,
    undoClearedSlot,
  } = useCleaningWeek(weekStartISO);

  const rosterQ = useQuery({ queryKey: ['publishers', 'roster'], queryFn: () => publishersApi.roster() });
  const eventsQ = useQuery({ queryKey: ['special-events', 'all'], queryFn: () => specialEventsApi.list({ all: true }) });
  const settingsQ = useQuery({ queryKey: ['meeting-settings'], queryFn: () => meetingSettingsApi.getOverview() });
  const publishersById = new Map<string, Publisher>((rosterQ.data?.data ?? []).map((p) => [p.id, p]));

  // A convention week has no meetings, so no cleaning — the programme screen
  // hid the section then; here the week says so.
  const rules = weekRules({
    weekStartISO,
    version: effectiveVersionFor(settingsQ.data?.versions, weekStartISO),
    events: eventsQ.data ?? [],
  });

  const canEdit = perms.canEditCleaning;
  const empty = !cleaningQuery.isLoading && cleaningWeek.assignments.length === 0;

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content}>
        {rules.congress ? (
          <Text style={styles.note}>
            {t('cleaningHall.congressWeek', { event: t(`specialEvents.types.${rules.congress.type}`) })}
          </Text>
        ) : (
          <>
            {/* The detail draws nothing for a reader when the week is empty. */}
            {empty && !canEdit ? <Text style={styles.note}>{t('cleaningHall.emptyWeek')}</Text> : null}
            <CleaningSection
              assignments={cleaningWeek.assignments}
              hideHeader
              publishersById={publishersById}
              canEdit={canEdit}
              weekStart={weekStartISO}
              pending={setCleaningSlotMutation.isPending || clearCleaningSlotMutation.isPending}
              onSetSlot={(slotType, serviceGroupId, windows) =>
                setCleaningSlotMutation.mutate({ slotType, serviceGroupId, windows })
              }
              onClearSlot={(slotType) => clearCleaningSlotMutation.mutate(slotType)}
            />
          </>
        )}
      </ScrollView>
      <UndoBar
        visible={!!clearedSlot}
        message={t('cleaning.cleared')}
        onUndo={async () => {
          await undoClearedSlot();
          // The list of weeks reads a range; it learns of the change through
          // the cache watch on the overview, but an undo goes around the hook's
          // own invalidation, so it is asked for here as well.
          queryClient.invalidateQueries({ queryKey: ['cleaning', 'range'] });
        }}
        onDismiss={() => setClearedSlot(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  note: { fontSize: 15, fontFamily: FONT.medium, color: '#64748b', paddingVertical: 8 },
});
