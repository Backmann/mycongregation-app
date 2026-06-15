import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  CleaningAssignment,
  CleaningSlotType,
  Publisher,
  ServiceGroup,
  serviceGroupsApi,
} from '../lib/api';

const GROUP_SLOTS: CleaningSlotType[] = ['after_meeting', 'thorough'];

function overseerName(
  group: ServiceGroup | null | undefined,
  publishersById: Map<string, Publisher>,
): string | null {
  if (!group) return null;
  if (group.overseer) return group.overseer.displayName;
  if (group.overseerPublisherId) {
    return publishersById.get(group.overseerPublisherId)?.displayName ?? null;
  }
  return null;
}

type Props = {
  assignments: CleaningAssignment[];
  publishersById: Map<string, Publisher>;
  canEdit: boolean;
  pending?: boolean;
  onSetSlot: (slotType: CleaningSlotType, serviceGroupId: string | null) => void;
  onClearSlot: (slotType: CleaningSlotType) => void;
};

export function CleaningSection({
  assignments,
  publishersById,
  canEdit,
  pending,
  onSetSlot,
  onClearSlot,
}: Props) {
  const { t } = useTranslation();

  const groupsQuery = useQuery({
    queryKey: ['service-groups'],
    queryFn: () => serviceGroupsApi.list(),
    staleTime: 5 * 60 * 1000,
  });
  const groups = (groupsQuery.data?.data ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  const bySlot = new Map<CleaningSlotType, CleaningAssignment>();
  for (const a of assignments) bySlot.set(a.slotType, a);

  const generalOn = bySlot.has('general');

  if (!canEdit && assignments.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Ionicons name="sparkles-outline" size={16} color="#475569" />
        <Text style={styles.headerText}>{t('cleaning.title')}</Text>
      </View>

      <View style={styles.card}>
        {GROUP_SLOTS.map((slot) => {
          const assigned = bySlot.get(slot) ?? null;
          const group = assigned?.serviceGroupId
            ? groupsById.get(assigned.serviceGroupId) ?? null
            : null;
          const overseer = overseerName(group, publishersById);
          return (
            <View key={slot} style={styles.slotRow}>
              <Text style={styles.slotLabel}>{t(`cleaning.slots.${slot}`)}</Text>

              {canEdit ? (
                <GroupSelect
                  title={t(`cleaning.slots.${slot}`)}
                  value={assigned?.serviceGroupId ?? null}
                  groups={groups}
                  publishersById={publishersById}
                  disabled={pending}
                  onChange={(id) =>
                    id ? onSetSlot(slot, id) : onClearSlot(slot)
                  }
                />
              ) : (
                <View style={styles.readValue}>
                  <Text
                    style={[styles.slotValue, !group && styles.slotEmpty]}
                    numberOfLines={1}
                  >
                    {group ? group.name : t('cleaning.empty')}
                  </Text>
                  {!!overseer && (
                    <Text style={styles.overseer} numberOfLines={1}>
                      {overseer}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* General cleaning — once a year, whole congregation */}
        <View style={styles.slotRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.slotLabel}>{t('cleaning.slots.general')}</Text>
            <Text style={styles.generalHint}>{t('cleaning.allCongregation')}</Text>
          </View>
          {canEdit ? (
            <Switch
              value={generalOn}
              disabled={pending}
              onValueChange={(on) =>
                on ? onSetSlot('general', null) : onClearSlot('general')
              }
            />
          ) : (
            <Text
              style={[styles.slotValue, !generalOn && styles.slotEmpty]}
              numberOfLines={1}
            >
              {generalOn ? t('cleaning.scheduled') : t('cleaning.empty')}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function GroupSelect({
  title,
  value,
  groups,
  publishersById,
  onChange,
  disabled,
}: {
  title: string;
  value: string | null;
  groups: ServiceGroup[];
  publishersById: Map<string, Publisher>;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = value ? groups.find((g) => g.id === value) ?? null : null;
  const currentOverseer = overseerName(current, publishersById);

  return (
    <>
      <Pressable
        style={styles.select}
        onPress={() => setOpen(true)}
        disabled={disabled}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.selectValue, !current && styles.selectPlaceholder]}
            numberOfLines={1}
          >
            {current ? current.name : t('cleaning.notSelected')}
          </Text>
          {!!currentOverseer && (
            <Text style={styles.overseer} numberOfLines={1}>
              {currentOverseer}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-down" size={16} color="#94a3b8" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <Pressable
                style={styles.pickerRow}
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Text style={styles.pickerClear}>
                  {t('cleaning.notSelected')}
                </Text>
                {!current && (
                  <Ionicons name="checkmark" size={18} color="#0ea5e9" />
                )}
              </Pressable>
              {groups.length === 0 && (
                <Text style={styles.noGroups}>{t('cleaning.noGroups')}</Text>
              )}
              {groups.map((g) => {
                const ovs = overseerName(g, publishersById);
                return (
                  <Pressable
                    key={g.id}
                    style={styles.pickerRow}
                    onPress={() => {
                      onChange(g.id);
                      setOpen(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerName} numberOfLines={1}>
                        {g.name}
                      </Text>
                      {!!ovs && (
                        <Text style={styles.overseer} numberOfLines={1}>
                          {ovs}
                        </Text>
                      )}
                    </View>
                    {value === g.id && (
                      <Ionicons name="checkmark" size={18} color="#0ea5e9" />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    gap: 12,
  },
  slotLabel: { fontSize: 14, color: '#0f172a', fontWeight: '600', flexShrink: 1 },
  generalHint: { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  readValue: { alignItems: 'flex-end', maxWidth: '60%' },
  slotValue: { fontSize: 14, color: '#334155', fontWeight: '600' },
  slotEmpty: { color: '#cbd5e1', fontWeight: '400' },
  overseer: { fontSize: 12, color: '#94a3b8', marginTop: 1 },

  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 160,
    maxWidth: 210,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'space-between',
  },
  selectValue: { fontSize: 14, color: '#0f172a' },
  selectPlaceholder: { color: '#94a3b8' },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pickerCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 8 },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    gap: 12,
  },
  pickerName: { fontSize: 15, color: '#0f172a' },
  pickerClear: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  noGroups: { fontSize: 13, color: '#94a3b8', paddingVertical: 12 },
});
