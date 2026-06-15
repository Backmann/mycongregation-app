import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  cleaningApi,
  CleaningSlotType,
  Publisher,
  serviceGroupsApi,
  ServiceGroup,
} from '../lib/api';
import { GroupSelect } from './CleaningSection';

interface Props {
  /** Open when non-null; the week being planned (Monday ISO). */
  weekStartISO: string | null;
  weekLabel: string | null;
  publishersById: Map<string, Publisher>;
  canEdit: boolean;
  onClose: () => void;
}

/** Group slots that count toward progress (general is a separate toggle). */
const GROUP_SLOTS: CleaningSlotType[] = ['after_meeting', 'thorough'];

/**
 * Cleaning planning — a focused overlay for assigning the week's cleaning to
 * service groups. Kept separate from PlanningMode because cleaning is a
 * weekly entity (not tied to a single meeting): after_meeting and thorough
 * are assigned to groups, while general is a whole-congregation toggle.
 */
export function CleaningPlanMode({
  weekStartISO,
  weekLabel,
  publishersById,
  canEdit,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const open = !!weekStartISO;
  const queryClient = useQueryClient();

  const cleaningQuery = useQuery({
    queryKey: ['cleaning', weekStartISO ?? ''],
    queryFn: () => cleaningApi.getWeek(weekStartISO!),
    enabled: !!weekStartISO,
  });
  const cleaningWeek = cleaningQuery.data ?? {
    assignments: [],
    suggestedAfterMeetingGroupId: null,
  };

  const groupsQuery = useQuery({
    queryKey: ['service-groups', 'names'],
    queryFn: () => serviceGroupsApi.list({}),
    enabled: !!weekStartISO,
  });
  const groups: ServiceGroup[] = groupsQuery.data?.data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['cleaning', weekStartISO ?? ''],
    });
  const setSlot = useMutation({
    mutationFn: (vars: {
      slotType: CleaningSlotType;
      serviceGroupId: string | null;
    }) =>
      cleaningApi.setSlot({
        weekStartDate: weekStartISO!,
        slotType: vars.slotType,
        serviceGroupId: vars.serviceGroupId,
      }),
    onSuccess: invalidate,
  });
  const clearSlot = useMutation({
    mutationFn: (slotType: CleaningSlotType) =>
      cleaningApi.clearSlot(weekStartISO!, slotType),
    onSuccess: invalidate,
  });

  const bySlot = useMemo(() => {
    const m = new Map<CleaningSlotType, string | null>();
    for (const a of cleaningWeek.assignments) {
      m.set(a.slotType, a.serviceGroupId);
    }
    return m;
  }, [cleaningWeek.assignments]);

  const assignedCount = GROUP_SLOTS.filter((s) => bySlot.get(s)).length;
  const totalCount = GROUP_SLOTS.length;
  const pct =
    totalCount === 0 ? 0 : Math.round((assignedCount / totalCount) * 100);
  const allDone = assignedCount === totalCount;
  const generalOn = bySlot.has('general');

  const pending = setSlot.isPending || clearSlot.isPending;

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
            {t('cleaning.planTitle')}
          </Text>
          <View style={{ width: 64 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          {weekLabel ? <Text style={styles.zoneTitle}>{weekLabel}</Text> : null}

          <View style={styles.progressWrap}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {t('schedule.planning.progress', {
                done: assignedCount,
                total: totalCount,
              })}
            </Text>
          </View>

          {allDone ? (
            <View style={styles.doneBox}>
              <Ionicons name="checkmark-circle" size={40} color="#22c55e" />
              <Text style={styles.doneText}>{t('cleaning.planAllDone')}</Text>
            </View>
          ) : null}

          <View style={[styles.card, { marginTop: 16 }]}>
            {GROUP_SLOTS.map((slot) => {
              const value = bySlot.get(slot) ?? null;
              const suggested =
                slot === 'after_meeting'
                  ? cleaningWeek.suggestedAfterMeetingGroupId
                  : null;
              return (
                <View key={slot} style={styles.slotRow}>
                  <View style={styles.slotLabelWrap}>
                    <Text style={styles.slotLabel}>
                      {t(`cleaning.slots.${slot}`)}
                    </Text>
                    {!value && suggested ? (
                      <Pressable
                        onPress={() =>
                          setSlot.mutate({
                            slotType: slot,
                            serviceGroupId: suggested,
                          })
                        }
                      >
                        <Text style={styles.suggestion}>
                          {t('cleaning.useSuggested', {
                            name:
                              groups.find((g) => g.id === suggested)?.name ??
                              '',
                          })}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {canEdit ? (
                    <GroupSelect
                      title={t(`cleaning.slots.${slot}`)}
                      value={value}
                      groups={groups}
                      publishersById={publishersById}
                      disabled={pending}
                      onChange={(id) =>
                        id
                          ? setSlot.mutate({ slotType: slot, serviceGroupId: id })
                          : clearSlot.mutate(slot)
                      }
                    />
                  ) : (
                    <Text style={styles.readValue} numberOfLines={1}>
                      {value
                        ? groups.find((g) => g.id === value)?.name ?? ''
                        : t('cleaning.empty')}
                    </Text>
                  )}
                </View>
              );
            })}

            <View style={styles.slotRow}>
              <View style={styles.slotLabelWrap}>
                <Text style={styles.slotLabel}>
                  {t('cleaning.slots.general')}
                </Text>
                <Text style={styles.generalHint}>
                  {t('cleaning.allCongregation')}
                </Text>
              </View>
              {canEdit ? (
                <Switch
                  value={generalOn}
                  disabled={pending}
                  onValueChange={(on) =>
                    on
                      ? setSlot.mutate({
                          slotType: 'general',
                          serviceGroupId: null,
                        })
                      : clearSlot.mutate('general')
                  }
                />
              ) : (
                <Text style={styles.readValue}>
                  {generalOn ? t('common.yes') : t('common.no')}
                </Text>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  headerBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  headerBtnText: { color: '#0ea5e9', fontSize: 15, fontWeight: '600' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  zoneTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  progressWrap: { marginTop: 16, marginBottom: 8 },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#0ea5e9' },
  progressText: {
    fontSize: 13,
    color: '#475569',
    marginTop: 6,
    fontWeight: '600',
  },
  card: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14 },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  slotLabelWrap: { flex: 1 },
  slotLabel: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  generalHint: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  suggestion: { fontSize: 13, color: '#0ea5e9', fontWeight: '600', marginTop: 4 },
  readValue: { fontSize: 15, color: '#475569' },
  doneBox: { alignItems: 'center', marginTop: 28, gap: 10 },
  doneText: {
    fontSize: 15,
    color: '#15803d',
    fontWeight: '600',
    textAlign: 'center',
  },
});
