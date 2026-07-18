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
import { MyDot } from './MyDot';
import { MyGlowRow } from './MyGlowRow';
import { ChipRow, PersonChip } from './PersonChip';

/** Icon + accent colour per duty type (role circle in the picker). */
export const DUTY_ICONS: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  security: { icon: 'shield-checkmark-outline', color: '#dc2626' },
  attendant: { icon: 'people-outline', color: '#2563eb' },
  microphone: { icon: 'mic-outline', color: '#9333ea' },
  av: { icon: 'videocam-outline', color: '#0891b2' },
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
  'av',
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
  /** Tighten horizontal padding/gaps (e.g. when shown two-up on a phone). */
  compact?: boolean;
  /** Duty ids auto-filled by a congregation rule (shows an "авто" badge). */
  autoDutyIds?: Set<string>;
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
  compact,
  autoDutyIds,
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

  // Card header: a coloured dot in the meeting's own colour, the meeting name
  // and how many of its duties are filled — the same "x/y" language the
  // schedule sections use.
  const cardHead = (
    meeting: Meeting,
    label: string,
    assigned: number,
    total: number,
  ) => {
    const accent = meeting === 'midweek' ? '#0d9488' : '#5b21b6';
    const done = total > 0 && assigned === total;
    return (
      <View style={styles.cardHead}>
        <View style={[styles.cardDot, { backgroundColor: accent }]} />
        <Text style={styles.cardTitle} numberOfLines={1}>
          {label}
        </Text>
        {total > 0 ? (
          <View
            style={[
              styles.cardCount,
              { backgroundColor: done ? '#dcfce7' : `${accent}14` },
            ]}
          >
            <Text
              style={[
                styles.cardCountText,
                { color: done ? '#166534' : accent },
              ]}
            >
              {assigned}/{total}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={only ? styles.embedded : styles.section}>
      {/* The per-meeting card carries its own title and counter, so the section
          header is only needed when this block is shown on its own. */}
      <View
        style={[
          only ? styles.embeddedHeader : styles.header,
          compact && styles.hPadCompact,
          hideHeader && styles.headerHidden,
        ]}
      >
        {!hideHeader ? (
          <Ionicons name="people-outline" size={16} color="#475569" />
        ) : null}
        {!hideHeader ? (
          <Text style={styles.headerText}>{t('duties.title')}</Text>
        ) : null}
        {only && !hideHeader && onlyList.length > 0 ? (
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
          // Duties auto-fill on open; show a subtle placeholder meanwhile.
          return (
            <View key={meeting} style={styles.card}>
              {cardHead(meeting, meetingLabel, 0, 0)}
              <View style={styles.preparingRow}>
                <Ionicons
                  name="hourglass-outline"
                  size={16}
                  color="#94a3b8"
                />
                <Text style={[styles.fillBtnText, { color: '#94a3b8' }]}>
                  {t('duties.preparing')}
                </Text>
              </View>
            </View>
          );
        }

        return (
          <View key={meeting} style={styles.card}>
            {cardHead(
              meeting,
              meetingLabel,
              list.filter((d) => d.publisherId).length,
              list.length,
            )}

            {canEdit ? (
              <View style={styles.cardBody}>
                {list.map((d) => {
                  const di = DUTY_ICONS[d.dutyType];
                  const isMine =
                    !!myPublisherId && d.publisherId === myPublisherId;
                  const RowWrap = isMine ? MyGlowRow : View;
                  return (
                    <RowWrap
                      key={d.id}
                      style={[
                        styles.editRow,
                        isMine && styles.editRowMine,
                      ]}
                    >
                      {di ? (
                        <View
                          style={[
                            styles.dutyIcon,
                            { backgroundColor: `${di.color}14` },
                          ]}
                        >
                          <Ionicons
                            name={di.icon}
                            size={17}
                            color={di.color}
                          />
                        </View>
                      ) : null}
                      <View style={styles.dutyLabelRow}>
                        {isMine ? <MyDot /> : null}
                        <Text style={styles.dutyLabel} numberOfLines={2}>
                          {dutyLabel(d, t)}
                        </Text>
                        {autoDutyIds?.has(d.id) ? (
                          <View style={styles.autoBadge}>
                            <Ionicons name="flash" size={10} color="#0369a1" />
                            <Text style={styles.autoBadgeText}>
                              {t('schedule.autoBadge')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.rowRight}>
                        <PublisherSelector
                          variant="chip"
                          emptyLabel={t('duties.unassigned')}
                          label={dutyLabel(d, t)}
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
                          <Ionicons
                            name="trash-outline"
                            size={20}
                            color="#dc2626"
                          />
                        </Pressable>
                      )}
                    </RowWrap>
                  );
                })}

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
              <View style={styles.cardBody}>
                {list.map((d) => {
                  const publisher = d.publisherId
                    ? publishersById.get(d.publisherId) ?? null
                    : null;
                  const isMine =
                    !!myPublisherId && d.publisherId === myPublisherId;
                  const RowWrap = isMine ? MyGlowRow : View;
                  return (
                    <RowWrap
                      key={d.id}
                      style={[
                        styles.roRow,
                        isMine && styles.rowMineGlow,
                      ]}
                    >
                      <Text style={styles.dutyLabel} numberOfLines={2}>
                        {dutyLabel(d, t)}
                      </Text>
                      <ChipRow>
                        {isMine ? <MyDot /> : null}
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
                    </RowWrap>
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
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCustomFor(null)}
            accessibilityRole="button"
          />
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
  countBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: 'Manrope_700Bold',},
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
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // microphone-count control

  // read-only list
  dutyLabel: {
    fontSize: 13.5,
    color: '#334155',
    flexShrink: 1,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  dutyLabelRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  autoBadgeText: { fontSize: 10, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0369a1' },
  rowMineGlow: {
    borderTopWidth: 0,
    marginHorizontal: -6,
    paddingHorizontal: 5,
    marginVertical: 2,
    borderRadius: 11,
  },

  // editable list
  headerHidden: { display: 'none' },
  card: {
    marginTop: 10,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e8edf3',
    borderRadius: 13,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f6',
  },
  cardDot: { width: 8, height: 8, borderRadius: 4 },
  cardTitle: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  cardCount: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  cardCountText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
  },
  cardBody: { paddingHorizontal: 11, paddingBottom: 2 },
  preparingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  rowRight: { alignItems: 'flex-end', flexShrink: 0, maxWidth: '52%' },
  roRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f6f9',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f6f9',
  },
  editRowMine: {
    borderTopWidth: 0,
    marginHorizontal: -6,
    paddingHorizontal: 5,
    marginVertical: 2,
  },
  dutyIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  delBtn: { padding: 6 },
  // two-up on narrow screens: tighten horizontal padding/margins
  hPadCompact: { paddingHorizontal: 8 },

  fillBtnPressed: { backgroundColor: '#e0f2fe' },
  fillBtnText: { fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0369a1' },
  addCustomBtn: {
    marginHorizontal: 11,
    marginTop: 2,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
  modalTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
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
  modalCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  modalConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
  },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
});
