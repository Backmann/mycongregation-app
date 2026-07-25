import { useState } from 'react';
import {
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
import { Dialog } from './Dialog';
import { SECTION_COLORS } from '../lib/section-colors';
import { ChipRow, PersonChip } from './PersonChip';

/** Every duty icon wears the section's own colour — see the row below. */
const DUTY_ICON_COLOR = SECTION_COLORS.duty.color;

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
  /** The meeting has taken place: the card becomes a muted, read-only record. */
  locked?: boolean;
  /** Date line under the card title, e.g. "среда, 22 июля · 19:00". */
  dateLabel?: string | null;
  /** This is the meeting still ahead — shown first on phones and marked. */
  nextUp?: boolean;
  /** The upcoming meeting is today (changes the marker wording). */
  nextUpToday?: boolean;
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
  locked,
  dateLabel,
  nextUp,
  nextUpToday,
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
    // A past meeting is a record, not a task: everything cools down to grey and
    // a small lock replaces the "next up" marker.
    // Colour says "duty" — which meeting it is, the title and date already say.
    const accent = locked ? '#94a3b8' : SECTION_COLORS.duty.color;
    const done = total > 0 && assigned === total;
    return (
      <View style={[styles.cardHead, locked && styles.cardHeadLocked]}>
        <View style={[styles.cardDot, { backgroundColor: accent }]} />
        <View style={styles.cardTitleWrap}>
          <Text
            style={[styles.cardTitle, locked && styles.cardTitleLocked]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {dateLabel ? (
            <Text style={styles.cardDate} numberOfLines={1}>
              {dateLabel}
            </Text>
          ) : null}
        </View>
        {locked ? (
          <View style={styles.pastChip}>
            <Ionicons name="lock-closed" size={10} color="#64748b" />
            <Text style={styles.pastChipText}>{t('duties.past')}</Text>
          </View>
        ) : nextUp ? (
          <View style={[styles.nextChip, { backgroundColor: `${accent}14` }]}>
            <Text style={[styles.nextChipText, { color: accent }]}>
              {nextUpToday ? t('duties.today') : t('duties.nextUp')}
            </Text>
          </View>
        ) : null}
        {total > 0 ? (
          <View
            style={[
              styles.cardCount,
              {
                backgroundColor: locked
                  ? '#f1f5f9'
                  : done
                    ? '#dcfce7'
                    : `${accent}14`,
              },
            ]}
          >
            <Text
              style={[
                styles.cardCountText,
                { color: locked ? '#64748b' : done ? '#166534' : accent },
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
          <View key={meeting} style={[styles.card, locked && styles.cardLocked]}>
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
                      kind="duty"
                      style={[
                        styles.editRow,
                        isMine && styles.editRowMine,
                      ]}
                    >
                      {di ? (
                        // One colour for every duty, and it is the section's
                        // own: colour says WHAT a thing is, and these are all
                        // the same thing. A different hue per duty was noise
                        // competing with the two marks that carry meaning —
                        // "not assigned" and "this one is yours".
                        <View
                          style={[
                            styles.dutyIcon,
                            locked && styles.dutyIconLocked,
                          ]}
                        >
                          <Ionicons
                            name={di.icon}
                            size={17}
                            color={locked ? '#94a3b8' : DUTY_ICON_COLOR}
                          />
                        </View>
                      ) : null}
                      <View style={styles.dutyLabelRow}>
                        {isMine ? <MyDot kind="duty" /> : null}
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
                    !locked &&
                    !!myPublisherId &&
                    d.publisherId === myPublisherId;
                  const RowWrap = isMine ? MyGlowRow : View;
                  return (
                    <RowWrap
                      key={d.id}
                      kind="duty"
                      style={[
                        styles.roRow,
                        isMine && styles.rowMineGlow,
                      ]}
                    >
                      <Text style={styles.dutyLabel} numberOfLines={2}>
                        {dutyLabel(d, t)}
                      </Text>
                      <ChipRow>
                        {isMine ? <MyDot kind="duty" /> : null}
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
      <Dialog
        visible={customFor !== null}
        title={t('duties.addCustom')}
        icon="add-circle-outline"
        iconTint="#dc2626"
        iconBg="#fee2e2"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('duties.addCustom')}
        confirmDisabled={!customLabel.trim()}
        pending={pending}
        onConfirm={submitCustom}
        onCancel={() => setCustomFor(null)}
      >
        <TextInput
          style={styles.modalInput}
          value={customLabel}
          onChangeText={setCustomLabel}
          placeholder={t('duties.customLabelPlaceholder')}
          placeholderTextColor="#94a3b8"
          autoFocus
          maxLength={255}
        />
      </Dialog>
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
  cardLocked: { backgroundColor: '#fcfdfe', borderColor: '#eef2f6' },
  cardHeadLocked: { backgroundColor: '#f3f5f8' },
  cardTitleLocked: { color: '#64748b' },
  pastChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pastChipText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
    color: '#64748b',
    textTransform: 'uppercase',
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
  cardTitleWrap: { flex: 1, minWidth: 0 },
  cardDate: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 1,
    textTransform: 'capitalize',
  },
  nextChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  nextChipText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
    textTransform: 'uppercase',
  },
  cardTitle: {
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
  // The chip yields before the label does: a name can be shortened with an
  // ellipsis, a duty name broken mid-word cannot be read at all.
  rowRight: {
    alignItems: 'flex-end',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '52%',
  },
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
  dutyIconLocked: { backgroundColor: '#f1f5f9' },
  dutyIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f7fa',
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
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
});
