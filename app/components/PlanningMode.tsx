import { useMemo, useState } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  Assignment,
  assignmentsApi,
  Duty,
  dutiesApi,
  Publisher,
} from '../lib/api';
import { PublisherSelector } from './PublisherSelector';
import { dutyLabel } from './DutiesSection';
import { AssignmentSheet } from './AssignmentSheet';
import { getPartLabel } from '../lib/parts';

interface Props {
  /** Open when non-null; the meeting zone being planned. */
  zone: {
    eventType: 'midweek' | 'weekend';
    title: string;
    meta: string | null;
    weekStartISO: string;
    nextWeekISO: string;
    weekStartDate: string;
  } | null;
  publishersById: Map<string, Publisher>;
  canPublish: boolean;
  publishing: boolean;
  canEdit: boolean;
  /** Separate right for duties — distinct from the meeting schedule. */
  canEditDuties: boolean;
  // openPublishDialog: opens the shared publish dialog for this zone.
  onPublish: (eventType: 'midweek' | 'weekend', weekStartDate: string) => void;
  onClose: () => void;
}

const SONG_KEYS = ['mid_song', 'weekend_song', 'weekend_opening_song'];

// Prayers import a verbose title (song + chairman's opening/closing words).
// In the planning list only the assignable role matters, so show the label.
const PRAYER_KEYS = new Set([
  'midweek_opening_prayer',
  'midweek_closing_prayer',
  'weekend_opening_prayer',
  'weekend_closing_prayer',
]);

function capabilityFor(duty: Duty): string | undefined {
  return duty.dutyType === 'custom' ? undefined : `duty_${duty.dutyType}`;
}

function isAssigned(a: Assignment): boolean {
  return !!a.publisherId || !!a.speakerName;
}


/**
 * Planning mode — a focused overlay for filling ONE meeting (the zone the
 * brother is responsible for). Shows what still needs assigning, then drafts,
 * with progress; tapping a row opens the same bottom sheet. When the zone is
 * fully assigned, a soft "publish this meeting" bar appears.
 */
export function PlanningMode({
  zone,
  publishersById,
  canPublish,
  publishing,
  canEdit,
  canEditDuties,
  onPublish,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const open = !!zone;
  const [editingInPlan, setEditingInPlan] = useState<Assignment | null>(
    null,
  );
  const [dutyPicker, setDutyPicker] = useState<Duty | null>(null);
  const queryClient = useQueryClient();

  const liveQuery = useQuery({
    queryKey: ['assignments', zone?.weekStartISO ?? ''],
    queryFn: () =>
      assignmentsApi.list({
        weekStart: zone!.weekStartISO,
        weekEnd: zone!.nextWeekISO,
      }),
    enabled: !!zone,
  });
  const dutiesQuery = useQuery({
    queryKey: ['duties', zone?.weekStartISO ?? ''],
    queryFn: () =>
      dutiesApi.list({
        weekStart: zone!.weekStartISO,
        weekEnd: zone!.nextWeekISO,
      }),
    enabled: !!zone,
  });
  const zoneDuties = useMemo(
    () =>
      canEditDuties
        ? (dutiesQuery.data ?? []).filter(
            (d) => d.eventType === zone?.eventType,
          )
        : [],
    [dutiesQuery.data, zone, canEditDuties],
  );
  const dutyAssign = useMutation({
    mutationFn: (vars: { id: string; publisherId: string | null }) =>
      dutiesApi.assign(vars.id, { publisherId: vars.publisherId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['duties', zone?.weekStartISO ?? ''],
      });
    },
  });

  const zoneItems = useMemo(() => {
    const all = (liveQuery.data?.data ?? []).filter(
      (a) => a.eventType === zone?.eventType,
    );
    return zone?.eventType === 'weekend'
      ? all.filter((a) => a.partKey !== 'weekend_hospitality')
      : all;
  }, [liveQuery.data, zone]);

  const { todo, drafts, assignedCount, totalCount } = useMemo(() => {
    const real = zoneItems.filter(
      (a) => !SONG_KEYS.includes(a.partKey),
    );
    const todo = real.filter((a) => !isAssigned(a));
    const drafts = real.filter(
      (a) => isAssigned(a) && String(a.status) === 'draft',
    );
    const assignedCount = real.filter(isAssigned).length;
    return { todo, drafts, assignedCount, totalCount: real.length };
  }, [zoneItems]);

  const dutiesTodo = useMemo(
    () => zoneDuties.filter((d) => !d.publisherId),
    [zoneDuties],
  );
  const dutiesAssignedCount = zoneDuties.length - dutiesTodo.length;

  const grandAssigned = assignedCount + dutiesAssignedCount;
  const grandTotal = totalCount + zoneDuties.length;
  const allDone = todo.length === 0 && dutiesTodo.length === 0;
  const pct =
    grandTotal === 0 ? 0 : Math.round((grandAssigned / grandTotal) * 100);

  const partTitleOf = (a: Assignment) => {
    if (PRAYER_KEYS.has(a.partKey)) return getPartLabel(a.partKey);
    return a.partTitle && a.partTitle.trim().length > 0
      ? a.partTitle
      : getPartLabel(a.partKey);
  };

  const assigneeOf = (a: Assignment): string | null => {
    if (a.publisherId) {
      return publishersById.get(a.publisherId)?.displayName ?? null;
    }
    if (a.speakerName) return a.speakerName;
    return null;
  };

  const dutyAssigneeOf = (d: Duty): string | null =>
    d.publisherId
      ? publishersById.get(d.publisherId)?.displayName ?? null
      : null;

  const DutyRow = ({ d }: { d: Duty }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => setDutyPicker(d)}
    >
      <View style={[styles.dot, styles.dotTodo]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {dutyLabel(d, t)}
        </Text>
        {d.publisherId ? (
          <Text style={styles.rowAssignee} numberOfLines={1}>
            {dutyAssigneeOf(d)}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );

  const Row = ({ a, draft }: { a: Assignment; draft: boolean }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => setEditingInPlan(a)}
    >
      <View
        style={[styles.dot, draft ? styles.dotDraft : styles.dotTodo]}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {partTitleOf(a)}
        </Text>
        {draft ? (
          <Text style={styles.rowAssignee} numberOfLines={1}>
            {assigneeOf(a)}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );

  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
      presentationStyle={Platform.OS === 'web' ? undefined : 'fullScreen'}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={22} color="#0ea5e9" />
            <Text style={styles.headerBtnText}>{t('common.close')}</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('schedule.planning.title')}
          </Text>
          <View style={{ width: 64 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <Text style={styles.zoneTitle}>{zone?.title}</Text>
          {zone?.meta ? <Text style={styles.zoneMeta}>{zone.meta}</Text> : null}

          <View style={styles.progressWrap}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {t('schedule.planning.progress', {
                done: grandAssigned,
                total: grandTotal,
              })}
            </Text>
          </View>

          {allDone ? (
            <View style={styles.doneBox}>
              <Ionicons
                name="checkmark-circle"
                size={40}
                color="#22c55e"
              />
              <Text style={styles.doneText}>
                {t('schedule.planning.allAssigned')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.groupHeader}>
                {t('schedule.planning.todoHeader', { count: todo.length })}
              </Text>
              <View style={styles.card}>
                {todo.map((a) => (
                  <Row key={a.id} a={a} draft={false} />
                ))}
              </View>
            </>
          )}

          {dutiesTodo.length > 0 ? (
            <>
              <Text style={[styles.groupHeader, { marginTop: 20 }]}>
                {t('schedule.planning.dutiesHeader', {
                  count: dutiesTodo.length,
                })}
              </Text>
              <View style={styles.card}>
                {dutiesTodo.map((d) => (
                  <DutyRow key={d.id} d={d} />
                ))}
              </View>
            </>
          ) : null}

          {drafts.length > 0 ? (
            <>
              <Text style={[styles.groupHeader, { marginTop: 20 }]}>
                {t('schedule.planning.draftHeader', { count: drafts.length })}
              </Text>
              <View style={styles.card}>
                {drafts.map((a) => (
                  <Row key={a.id} a={a} draft />
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>

        {canPublish && (todo.length === 0 || drafts.length > 0) ? (
          <View style={styles.publishBar}>
            <Pressable
              style={({ pressed }) => [
                styles.publishBtn,
                pressed && styles.publishBtnPressed,
                publishing && styles.publishBtnDisabled,
              ]}
              disabled={publishing}
              onPress={() =>
                zone && onPublish(zone.eventType, zone.weekStartDate)
              }
            >
              <Text style={styles.publishBtnText}>
                {publishing
                  ? t('schedule.planning.publishing')
                  : t('schedule.planning.publishThis')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <Modal
        visible={!!dutyPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setDutyPicker(null)}
      >
        <View style={styles.dutyBackdrop}>
          <View style={styles.dutySheet}>
            <View style={styles.dutySheetHeader}>
              <Text style={styles.dutySheetTitle} numberOfLines={1}>
                {dutyPicker ? dutyLabel(dutyPicker, t) : ''}
              </Text>
              <Pressable
                onPress={() => setDutyPicker(null)}
                hitSlop={8}
              >
                <Text style={styles.headerBtnText}>{t('common.close')}</Text>
              </Pressable>
            </View>
            {dutyPicker ? (
              <PublisherSelector
                label={t('duties.assignee')}
                value={dutyPicker.publisherId}
                requiredCapability={capabilityFor(dutyPicker)}
                onChange={(id) => {
                  dutyAssign.mutate({ id: dutyPicker.id, publisherId: id });
                  setDutyPicker(null);
                }}
              />
            ) : null}
          </View>
        </View>
      </Modal>
      <AssignmentSheet
        assignment={editingInPlan}
        weekStartISO={zone?.weekStartDate ?? ''}
        canEdit={canEdit}
        onNext={(() => {
          if (!editingInPlan) return null;
          const nextUnassigned = zoneItems.find(
            (a) =>
              !SONG_KEYS.includes(a.partKey) &&
              !a.publisherId &&
              !a.speakerName &&
              a.id !== editingInPlan.id,
          );
          return nextUnassigned
            ? () => setEditingInPlan(nextUnassigned)
            : null;
        })()}
        onClose={() => setEditingInPlan(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  headerBtnText: { color: '#0ea5e9', fontSize: 15, fontWeight: '600' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#0f172a' },
  zoneTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  zoneMeta: { fontSize: 14, color: '#64748b', marginTop: 2, textTransform: 'capitalize' },
  progressWrap: { marginTop: 16, marginBottom: 8 },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#0ea5e9' },
  progressText: { fontSize: 13, color: '#475569', marginTop: 6, fontWeight: '600' },
  groupHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  card: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  rowPressed: { opacity: 0.6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  dotTodo: { backgroundColor: '#f43f5e' },
  dotDraft: { backgroundColor: '#f59e0b' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  rowAssignee: { fontSize: 13, color: '#0369a1', marginTop: 2 },
  doneBox: { alignItems: 'center', marginTop: 28, gap: 10 },
  doneText: { fontSize: 15, color: '#15803d', fontWeight: '600', textAlign: 'center' },
  publishBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: 'rgba(248,250,252,0.96)',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    ...(Platform.OS === 'web' ? { maxWidth: 680, marginHorizontal: 'auto' as never } : null),
  },
  publishBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  publishBtnPressed: { opacity: 0.85 },
  publishBtnDisabled: { opacity: 0.5 },
  publishBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dutyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  dutySheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '80%',
  },
  dutySheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dutySheetTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', flex: 1 },

});
