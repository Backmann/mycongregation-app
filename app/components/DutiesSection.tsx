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
import { getEventTypeLabel } from '../lib/parts';
import { useMyPublisher } from '../lib/useMyPublisher';
import { MyBulb } from './MyBulb';
import { ChipRow, PersonChip } from './PersonChip';

/** Icon + accent colour per duty type (role circle in the picker). */
const DUTY_ICONS: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  security: { icon: 'shield-checkmark-outline', color: '#dc2626' },
  attendant: { icon: 'people-outline', color: '#2563eb' },
  microphone: { icon: 'mic-outline', color: '#9333ea' },
  audio: { icon: 'volume-high-outline', color: '#0891b2' },
  video: { icon: 'videocam-outline', color: '#ea580c' },
  zoom: { icon: 'laptop-outline', color: '#4f46e5' },
  stage: { icon: 'tv-outline', color: '#0d9488' },
  ventilation: { icon: 'cloud-outline', color: '#0284c7' },
  custom: { icon: 'ellipsis-horizontal-circle-outline', color: '#64748b' },
};

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
  /** Meetings replaced by a special event this week; their duty blocks are hidden. */
  replacedEventTypes?: Meeting[];
  /** Render only this meeting, embedded inside its collapsible block. */
  only?: Meeting;
  /** Hide the "Duties" title text (when wrapped in an outer collapsible). */
  hideHeader?: boolean;
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
  replacedEventTypes,
  only,
  hideHeader,
}: Props) {
  const { t } = useTranslation();
  const { myPublisherId } = useMyPublisher();
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

  const onlyList = only ? (byMeeting.get(only) ?? []) : [];
  const onlyAssigned = onlyList.filter((d) => d.publisherId).length;
  if (only && onlyList.length === 0 && !canEdit) return null;

  const submitCustom = () => {
    const label = customLabel.trim();
    if (customFor && label) onAddCustom(customFor, label);
    setCustomFor(null);
    setCustomLabel('');
  };

  return (
    <View style={only ? styles.embedded : styles.section}>
      <View style={only ? styles.embeddedHeader : styles.header}>
        <Ionicons name="people-outline" size={16} color="#475569" />
        {!hideHeader ? (
          <Text style={styles.headerText}>{t('duties.title')}</Text>
        ) : null}
        {only && onlyList.length > 0 ? (
          <View
            style={[
              styles.countBadge,
              onlyAssigned === onlyList.length
                ? styles.countBadgeDone
                : styles.countBadgeOpen,
            ]}
          >
            <Text
              style={[
                styles.countBadgeText,
                onlyAssigned === onlyList.length
                  ? styles.countTextDone
                  : styles.countTextOpen,
              ]}
            >
              {onlyAssigned}/{onlyList.length}
            </Text>
          </View>
        ) : null}
      </View>

      {(only ? [only] : MEETINGS).map((meeting) => {
        // Meeting replaced by a special event — hide its duties entirely,
        // including the empty block with the Generate button.
        if (replacedEventTypes?.includes(meeting)) return null;
        const list = (byMeeting.get(meeting) ?? []).slice().sort(sortDuties);
        const meetingLabel = getEventTypeLabel(meeting);

        if (list.length === 0) {
          if (!canEdit) return null;
          return (
            <View key={meeting} style={styles.meetingBlock}>
              <View style={styles.dayChip}>
                <Ionicons name="calendar-outline" size={13} color="#fff" />
                <Text style={styles.dayChipText}>{meetingLabel}</Text>
              </View>
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
            <View style={styles.dayChip}>
              <Ionicons name="calendar-outline" size={13} color="#fff" />
              <Text style={styles.dayChipText}>{meetingLabel}</Text>
            </View>

            {canEdit ? (
              <View style={styles.editList}>
                {list.map((d) => (
                  <View key={d.id} style={styles.editRow}>
                    <View style={styles.editCell}>
                      <Text style={styles.dutyLabel}>{dutyLabel(d, t)}</Text>
                      <PublisherSelector
                        variant="chip"
                        emptyLabel={t('duties.unassigned')}
                        label={dutyLabel(d, t)}
                        roleIcon={DUTY_ICONS[d.dutyType]?.icon}
                        roleColor={DUTY_ICONS[d.dutyType]?.color}
                        value={d.publisherId}
                        onChange={(id) => onAssign(d.id, id)}
                        requiredCapability={capabilityFor(d)}
                        activityById={activityById}
                        scopeDutyType={d.dutyType}
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
                  const isMine =
                    !!myPublisherId && d.publisherId === myPublisherId;
                  return (
                    <View
                      key={d.id}
                      style={[styles.row, isMine && styles.rowMine]}
                    >
                      <Text style={styles.dutyLabel}>{dutyLabel(d, t)}</Text>
                      <ChipRow>
                        {isMine ? <MyBulb size={15} /> : null}
                        {publisher ? (
                          <PersonChip
                            label={publisher.displayName}
                            variant="main"
                          />
                        ) : (
                          <PersonChip
                            label={t('duties.unassigned')}
                            variant="empty"
                          />
                        )}
                      </ChipRow>
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
  embedded: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingBottom: 12,
  },
  embeddedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  countBadge: {
    marginLeft: 'auto',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeOpen: { backgroundColor: '#fef3c7' },
  countBadgeDone: { backgroundColor: '#dcfce7' },
  countBadgeText: { fontSize: 11, fontWeight: '700' },
  countTextOpen: { color: '#92400e' },
  countTextDone: { color: '#166534' },
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
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#0d9488',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 14,
    marginBottom: 10,
  },
  dayChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // read-only list
  rows: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    gap: 6,
  },
  dutyLabel: { fontSize: 14, color: '#0f172a', flexShrink: 1 },
  rowMine: { backgroundColor: '#fffbeb' },

  // editable list
  editList: { paddingHorizontal: 16, gap: 4 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editCell: { flex: 1, gap: 6, paddingVertical: 6 },
  delBtn: { padding: 6 },

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
