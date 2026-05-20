import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Duty, DutyType, Publisher, PublisherActivity } from '../lib/api';
import { PublisherSelector } from './PublisherSelector';

type Meeting = 'midweek' | 'weekend';

const MEETINGS: Meeting[] = ['midweek', 'weekend'];

const DUTY_TYPE_ORDER: DutyType[] = [
  'security',
  'attendant',
  'microphone',
  'audio',
  'video',
  'zoom',
  'stage',
  'ventilation',
  'custom',
];

function orderIndex(t: DutyType): number {
  const i = DUTY_TYPE_ORDER.indexOf(t);
  return i === -1 ? DUTY_TYPE_ORDER.length : i;
}

function sortDuties(a: Duty, b: Duty): number {
  return orderIndex(a.dutyType) - orderIndex(b.dutyType) || a.slotIndex - b.slotIndex;
}

export function dutyLabel(duty: Duty, t: (k: string) => string): string {
  if (duty.dutyType === 'custom') {
    return duty.customLabel || t('duties.types.custom');
  }
  if (duty.dutyType === 'microphone') {
    return `${t('duties.types.microphone')} ${duty.slotIndex + 1}`;
  }
  return t(`duties.types.${duty.dutyType}`);
}

function capabilityFor(duty: Duty): string | undefined {
  return duty.dutyType === 'custom' ? undefined : `duty_${duty.dutyType}`;
}

type Props = {
  duties: Duty[];
  publishersById: Map<string, Publisher>;
  canEdit: boolean;
  onGenerate: (eventType: Meeting) => void;
  onAssign: (dutyId: string, publisherId: string | null) => void;
  onAddCustom: (eventType: Meeting, customLabel: string) => void;
  onRemoveDuty: (dutyId: string) => void;
  activityById?: Map<string, PublisherActivity>;
  weekStartISO?: string;
  pending?: boolean;
};

export function DutiesSection({
  duties,
  publishersById,
  canEdit,
  onGenerate,
  onAssign,
  onAddCustom,
  onRemoveDuty,
  activityById,
  weekStartISO,
  pending,
}: Props) {
  const { t } = useTranslation();
  const [customFor, setCustomFor] = useState<Meeting | null>(null);
  const [customLabel, setCustomLabel] = useState('');

  if (duties.length === 0 && !canEdit) return null;

  const byMeeting = new Map<Meeting, Duty[]>();
  for (const d of duties) {
    const m = d.eventType as Meeting;
    if (m !== 'midweek' && m !== 'weekend') continue;
    const arr = byMeeting.get(m) ?? [];
    arr.push(d);
    byMeeting.set(m, arr);
  }

  const submitCustom = () => {
    const label = customLabel.trim();
    if (customFor && label) onAddCustom(customFor, label);
    setCustomFor(null);
    setCustomLabel('');
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Ionicons name="people-outline" size={16} color="#475569" />
        <Text style={styles.headerText}>{t('duties.title')}</Text>
      </View>

      {MEETINGS.map((meeting) => {
        const list = (byMeeting.get(meeting) ?? []).slice().sort(sortDuties);
        const meetingLabel = t(`meetingSettings.${meeting}`);

        if (list.length === 0) {
          if (!canEdit) return null;
          return (
            <View key={meeting} style={styles.meetingBlock}>
              <Text style={styles.meetingLabel}>{meetingLabel}</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.fillBtn,
                  pressed && styles.fillBtnPressed,
                  pending && styles.disabled,
                ]}
                onPress={() => onGenerate(meeting)}
                disabled={pending}
              >
                <Ionicons name="add-circle-outline" size={16} color="#0369a1" />
                <Text style={styles.fillBtnText}>{t('duties.generate')}</Text>
              </Pressable>
            </View>
          );
        }

        return (
          <View key={meeting} style={styles.meetingBlock}>
            <Text style={styles.meetingLabel}>{meetingLabel}</Text>

            {canEdit ? (
              <View style={styles.editList}>
                {list.map((d) => (
                  <View key={d.id} style={styles.editRow}>
                    <View style={{ flex: 1 }}>
                      <PublisherSelector
                        label={dutyLabel(d, t)}
                        value={d.publisherId}
                        onChange={(id) => onAssign(d.id, id)}
                        requiredCapability={capabilityFor(d)}
                        activityById={activityById}
                        currentWeekStart={weekStartISO}
                        currentEventType={meeting}
                      />
                    </View>
                    {d.dutyType === 'custom' && (
                      <Pressable
                        onPress={() => onRemoveDuty(d.id)}
                        hitSlop={8}
                        style={styles.delBtn}
                        disabled={pending}
                      >
                        <Ionicons name="trash-outline" size={20} color="#dc2626" />
                      </Pressable>
                    )}
                  </View>
                ))}

                <Pressable
                  style={({ pressed }) => [
                    styles.addCustomBtn,
                    pressed && styles.fillBtnPressed,
                  ]}
                  onPress={() => {
                    setCustomLabel('');
                    setCustomFor(meeting);
                  }}
                >
                  <Ionicons name="add-outline" size={16} color="#0369a1" />
                  <Text style={styles.fillBtnText}>{t('duties.addCustom')}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.rows}>
                {list.map((d) => {
                  const publisher = d.publisherId
                    ? publishersById.get(d.publisherId) ?? null
                    : null;
                  return (
                    <View key={d.id} style={styles.row}>
                      <Text style={styles.dutyLabel}>{dutyLabel(d, t)}</Text>
                      <Text
                        style={[styles.publisher, !publisher && styles.unassigned]}
                        numberOfLines={1}
                      >
                        {publisher ? publisher.displayName : t('duties.unassigned')}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      {/* Custom duty label modal */}
      <Modal
        visible={customFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomFor(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('duties.addCustom')}</Text>
            <TextInput
              style={styles.modalInput}
              value={customLabel}
              onChangeText={setCustomLabel}
              placeholder={t('duties.customLabelPlaceholder')}
              placeholderTextColor="#94a3b8"
              autoFocus
              maxLength={255}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setCustomFor(null)}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalConfirm,
                  !customLabel.trim() && styles.disabled,
                ]}
                onPress={submitCustom}
                disabled={!customLabel.trim()}
              >
                <Text style={styles.modalConfirmText}>{t('duties.addCustom')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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

  // microphone-count control
  meetingBlock: { marginTop: 8 },
  meetingLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    paddingHorizontal: 16,
    marginBottom: 4,
  },

  // read-only list
  rows: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    gap: 12,
  },
  dutyLabel: { fontSize: 14, color: '#0f172a', flexShrink: 1 },
  publisher: { fontSize: 14, color: '#334155', fontWeight: '600', maxWidth: '55%' },
  unassigned: { color: '#cbd5e1', fontWeight: '400' },

  // editable list
  editList: { paddingHorizontal: 16, gap: 4 },
  editRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  delBtn: { padding: 6, marginBottom: 6 },

  fillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
  },
  fillBtnPressed: { backgroundColor: '#e0f2fe' },
  fillBtnText: { fontSize: 14, fontWeight: '600', color: '#0369a1' },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#bae6fd',
    backgroundColor: '#f8fafc',
  },
  disabled: { opacity: 0.5 },

  // custom modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  modalConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
  },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
