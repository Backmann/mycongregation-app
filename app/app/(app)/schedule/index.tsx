import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Assignment,
  assignmentsApi,
  CreateAssignmentInput,
  EventType,
  extractErrorMessage,
  Publisher,
  publishersApi,
} from '../../../lib/api';
import {
  addWeeks,
  formatDateISO,
  startOfWeekMonday,
} from '../../../lib/dates';
import {
  EVENT_TYPE_LABELS,
  getPartLabel,
  MIDWEEK_PARTS,
} from '../../../lib/parts';
import { WeekNavigator } from '../../../components/WeekNavigator';

const EVENT_TYPE_ORDER: EventType[] = [
  'midweek',
  'weekend',
  'cleaning',
  'av_duty',
  'public_witnessing',
];

export default function ScheduleIndexScreen() {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeekMonday(new Date()),
  );

  const weekStartISO = formatDateISO(weekStart);
  const nextWeekISO = formatDateISO(addWeeks(weekStart, 1));

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', weekStartISO],
    queryFn: () =>
      assignmentsApi.list({
        weekStart: weekStartISO,
        weekEnd: nextWeekISO,
      }),
  });

  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all-for-schedule'],
    queryFn: () => publishersApi.list({ limit: 200 }),
  });

  const createWeekMutation = useMutation({
    mutationFn: (eventType: EventType) => {
      const parts =
        eventType === 'midweek' ? MIDWEEK_PARTS : [];
      const inputs: CreateAssignmentInput[] = parts.map((p) => ({
        weekStartDate: weekStartISO,
        eventType,
        partKey: p.key,
        partOrder: p.defaultOrder,
        partDurationMin: p.defaultDurationMin || undefined,
        status: 'draft',
      }));
      return assignmentsApi.bulkCreate(inputs);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', weekStartISO] });
    },
  });

  const assignments = assignmentsQuery.data?.data ?? [];
  const publishersById = new Map<string, Publisher>(
    (publishersQuery.data?.data ?? []).map((p) => [p.id, p]),
  );

  const grouped = new Map<EventType, Assignment[]>();
  for (const a of assignments) {
    const arr = grouped.get(a.eventType) ?? [];
    arr.push(a);
    grouped.set(a.eventType, arr);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.partOrder - b.partOrder);
  }

  const hasMidweek = (grouped.get('midweek')?.length ?? 0) > 0;

  return (
    <View style={styles.container}>
      <WeekNavigator weekStart={weekStart} onChange={setWeekStart} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={assignmentsQuery.isRefetching}
            onRefresh={() => assignmentsQuery.refetch()}
          />
        }
      >
        {assignmentsQuery.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {extractErrorMessage(assignmentsQuery.error)}
            </Text>
          </View>
        )}

        {assignmentsQuery.isLoading ? (
          <ActivityIndicator size="large" style={{ marginTop: 32 }} />
        ) : assignments.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No assignments for this week.</Text>
            <Pressable
              style={[
                styles.bigButton,
                createWeekMutation.isPending && { opacity: 0.6 },
              ]}
              onPress={() => createWeekMutation.mutate('midweek')}
              disabled={createWeekMutation.isPending}
            >
              <Text style={styles.bigButtonText}>
                {createWeekMutation.isPending
                  ? 'Creating…'
                  : 'Create empty midweek week (13 slots)'}
              </Text>
            </Pressable>
            {createWeekMutation.error && (
              <Text style={styles.errorText}>
                {extractErrorMessage(createWeekMutation.error)}
              </Text>
            )}
          </View>
        ) : (
          <>
            {EVENT_TYPE_ORDER.map((eventType) => {
              const items = grouped.get(eventType) ?? [];
              if (items.length === 0) return null;
              return (
                <View key={eventType} style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    {EVENT_TYPE_LABELS[eventType]} ({items.length})
                  </Text>
                  <View style={styles.sectionBody}>
                    {items.map((a) => (
                      <AssignmentRow
                        key={a.id}
                        assignment={a}
                        publisher={
                          a.publisherId
                            ? publishersById.get(a.publisherId) ?? null
                            : null
                        }
                        assistant={
                          a.assistantPublisherId
                            ? publishersById.get(a.assistantPublisherId) ?? null
                            : null
                        }
                      />
                    ))}
                  </View>
                </View>
              );
            })}

            {!hasMidweek && (
              <Pressable
                style={styles.bigButton}
                onPress={() => createWeekMutation.mutate('midweek')}
                disabled={createWeekMutation.isPending}
              >
                <Text style={styles.bigButtonText}>
                  Create empty midweek week
                </Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function AssignmentRow({
  assignment,
  publisher,
  assistant,
}: {
  assignment: Assignment;
  publisher: Publisher | null;
  assistant: Publisher | null;
}) {
  const partLabel = getPartLabel(assignment.partKey);
  const isUnassigned = !publisher;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => router.push(`/schedule/${assignment.id}` as any)}
    >
      <View style={styles.orderBadge}>
        <Text style={styles.orderText}>{assignment.partOrder || '–'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.partLabel}>{partLabel}</Text>
        {assignment.partTitle && (
          <Text style={styles.partTitle} numberOfLines={2}>
            {assignment.partTitle}
          </Text>
        )}
        <View style={styles.assigneeRow}>
          {isUnassigned ? (
            <Text style={styles.unassigned}>Unassigned</Text>
          ) : (
            <Text style={styles.assignee}>{publisher!.displayName}</Text>
          )}
          {assistant && (
            <Text style={styles.assistant}> + {assistant.displayName}</Text>
          )}
        </View>
        {assignment.status !== 'draft' && (
          <View
            style={[
              styles.statusBadge,
              assignment.status === 'published' && styles.statusPublished,
              assignment.status === 'cancelled' && styles.statusCancelled,
            ]}
          >
            <Text style={styles.statusBadgeText}>
              {assignment.status.toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  empty: {
    paddingHorizontal: 24,
    paddingTop: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 16,
    textAlign: 'center',
  },
  bigButton: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    margin: 16,
    alignItems: 'center',
  },
  bigButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  sectionBody: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'flex-start',
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  orderBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  orderText: { color: '#0369a1', fontWeight: '700', fontSize: 13 },
  partLabel: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  partTitle: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
    fontStyle: 'italic',
  },
  assigneeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  assignee: { fontSize: 14, color: '#0f172a' },
  assistant: { fontSize: 13, color: '#64748b' },
  unassigned: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    marginTop: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  statusPublished: { backgroundColor: '#dcfce7' },
  statusCancelled: { backgroundColor: '#fee2e2' },
  chevron: { color: '#cbd5e1', fontSize: 24, marginLeft: 8 },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14 },
});
