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

/**
 * The Memorial is a third kind of meeting, so its duties are ordinary duties
 * and this section shows them like any other — with the same add, remove,
 * counters and printing. That is why it was made a kind rather than given
 * machinery of its own.
 */
type Meeting = 'midweek' | 'weekend' | 'memorial';

const MEETINGS: Meeting[] = ['midweek', 'weekend', 'memorial'];

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

/**
 * The label a place is known by, WITHOUT the ordinal.
 *
 * `dutyLabel` gives «Микрофон 1» and «Микрофон 2», which is what a row shows;
 * for grouping we need the thing they have in common.
 */
function groupKeyOf(d: Duty): string {
  return d.dutyType === 'custom'
    ? `custom:${d.customLabel ?? ''}`
    : d.dutyType;
}

/**
 * Rows that stand at the SAME place, gathered.
 *
 * Several brothers at one place are several rows sharing a label — that is how
 * the microphones have always worked, and it is what lets one of the three at
 * the parking be replaced without editing inside a field. Repeating «Стоянка»
 * three times is true about the rows and false about the sheet, so the rows
 * are gathered for reading.
 *
 * The list is already sorted, so members of a group are adjacent.
 */
function groupsOf(list: Duty[]): Duty[][] {
  const groups: Duty[][] = [];
  for (const d of list) {
    const last = groups[groups.length - 1];
    if (last && groupKeyOf(last[0]) === groupKeyOf(d)) last.push(d);
    else groups.push([d]);
  }
  return groups;
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

/** The group's own name: «Микрофон», not «Микрофон 2». */
function groupLabel(duty: Duty, t: (k: string) => string): string {
  if (duty.dutyType === 'custom') {
    return duty.customLabel || t('duties.types.custom');
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
  /** Rename a PLACE — all of its rows at once. Own places only. */
  onRenamePlace?: (dutyId: string, customLabel: string) => void;
  /** Remove a place with everybody at it; the bin takes off one person. */
  onRemovePlace?: (dutyId: string) => void;
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
  onRenamePlace,
  onRemovePlace,
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
  const [renameFor, setRenameFor] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState('');
  const [removeFor, setRemoveFor] = useState<Duty | null>(null);

  if (duties.length === 0 && !canEdit) return null;

  const byMeeting = new Map<Meeting, Duty[]>();
  for (const d of duties) {
    const m = d.eventType as Meeting;
    // Asks the LIST above, instead of naming the kinds again. Naming them here
    // is what kept the Memorial's duties out of the screen after everything
    // else had learned about it: the line compares VALUES, so extending the
    // type said nothing to it and the type checker had nothing to object to.
    // The same shape of mistake as the three server forms an hour earlier.
    if (!MEETINGS.includes(m)) continue;
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

                // The one-person case, unchanged: icon, name, chip, bin on a
                // single line. Only places with several people are gathered.
                const SingleRow = ({ d }: { d: Duty }) => {
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
                };
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
                {groupsOf(list).map((group) =>
                  group.length > 1 ? (
                    // A place several brothers stand at: the name once, the
                    // people under it. A single-person place is left exactly as
                    // it was — the common case must not change shape.
                    <View key={group[0].id} style={styles.group}>
                      <View style={styles.groupHead}>
                        {DUTY_ICONS[group[0].dutyType] ? (
                          <View
                            style={[
                              styles.dutyIcon,
                              {
                                backgroundColor: `${DUTY_ICONS[group[0].dutyType].color}14`,
                              },
                            ]}
                          >
                            <Ionicons
                              name={DUTY_ICONS[group[0].dutyType].icon}
                              size={17}
                              color={DUTY_ICONS[group[0].dutyType].color}
                            />
                          </View>
                        ) : null}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.dutyLabel}>
                            {groupLabel(group[0], t)}
                          </Text>
                          {/* What the assignee has to know before the evening —
                              «светоотражающие жилетки». It was written on the
                              row and shown nowhere. */}
                          {group[0].notes ? (
                            <Text style={styles.dutyNote}>
                              {group[0].notes}
                            </Text>
                          ) : null}
                        </View>
                        {/* Only a place the congregation named itself: a
                            predefined duty takes its name from the
                            translations, and writing over it would break the
                            language for everybody else. The same line the bin
                            on a row already draws. */}
                        {group[0].dutyType === 'custom' && onRenamePlace ? (
                          <Pressable
                            hitSlop={8}
                            disabled={pending}
                            style={styles.placeBtn}
                            onPress={() => {
                              setRenameFor(group[0].id);
                              setRenameLabel(groupLabel(group[0], t));
                            }}
                          >
                            <Ionicons
                              name="pencil-outline"
                              size={17}
                              color="#0369a1"
                            />
                          </Pressable>
                        ) : null}
                        {group[0].dutyType === 'custom' && onRemovePlace ? (
                          <Pressable
                            hitSlop={8}
                            disabled={pending}
                            style={styles.placeBtn}
                            onPress={() => setRemoveFor(group[0])}
                          >
                            <Ionicons
                              name="trash-outline"
                              size={17}
                              color="#dc2626"
                            />
                          </Pressable>
                        ) : null}
                      </View>
                      {group.map((d, i) => (
                        <View key={d.id} style={styles.groupRow}>
                          <Text style={styles.groupOrdinal}>{i + 1}</Text>
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
                        </View>
                      ))}
                      {/* One more pair of hands at the SAME place: the server
                          gives the new row the next slot by itself, so this is
                          the ordinary «add a duty» with the name already
                          filled in. */}
                      {group[0].dutyType === 'custom' ? (
                        <Pressable
                          style={styles.groupAdd}
                          disabled={pending}
                          onPress={() =>
                            onAddCustom(meeting, groupLabel(group[0], t))
                          }
                        >
                          <Ionicons name="add" size={14} color="#0369a1" />
                          <Text style={styles.groupAddText}>
                            {t('duties.addAnother')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : (
                    <SingleRow key={group[0].id} d={group[0]} />
                  ),
                )}
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
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dutyLabel} numberOfLines={2}>
                          {dutyLabel(d, t)}
                        </Text>
                        {/* «Светоотражающие жилетки» — what the assignee has
                            to know before the evening. It was written on the
                            row and shown nowhere. */}
                        {d.notes ? (
                          <Text style={styles.dutyNote}>{d.notes}</Text>
                        ) : null}
                      </View>
                      <ChipRow>
                        {isMine ? <MyDot kind="duty" /> : null}
                        {publisher ? (
                          // A past meeting is a record, not an offer: the name
                          // goes pale so nobody mistakes it for this week's.
                          <PersonChip
                            label={publisher.displayName}
                            variant="main"
                            muted
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

      {/* Renaming a place: the name is what the congregation calls it, and it
          changes for every row of the place at once. */}
      <Dialog
        visible={renameFor !== null}
        title={t('duties.renamePlace')}
        icon="pencil-outline"
        iconTint="#0369a1"
        iconBg="#e0f2fe"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.save')}
        confirmDisabled={!renameLabel.trim()}
        pending={pending}
        onConfirm={() => {
          const label = renameLabel.trim();
          if (renameFor && label) onRenamePlace?.(renameFor, label);
          setRenameFor(null);
        }}
        onCancel={() => setRenameFor(null)}
      >
        <TextInput
          style={styles.modalInput}
          value={renameLabel}
          onChangeText={setRenameLabel}
          autoFocus
          maxLength={60}
        />
      </Dialog>

      {/* Removing a place takes everybody off it at once, and a duty is not
          soft-deleted — so it is asked first, with the name in the question. */}
      <Dialog
        visible={removeFor !== null}
        title={t('duties.removePlace')}
        icon="trash-outline"
        iconTint="#dc2626"
        iconBg="#fee2e2"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        pending={pending}
        onConfirm={() => {
          if (removeFor) onRemovePlace?.(removeFor.id);
          setRemoveFor(null);
        }}
        onCancel={() => setRemoveFor(null)}
      >
        <Text style={styles.dialogText}>
          {removeFor
            ? t('duties.removePlaceAsk', { label: groupLabel(removeFor, t) })
            : ''}
        </Text>
      </Dialog>

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
  dutyIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A place several brothers stand at, gathered: the name once, the people
  // under it. Boxed lightly so the group reads as one thing without shouting.
  group: {
    borderWidth: 1,
    borderColor: '#eef2f6',
    borderRadius: 12,
    padding: 8,
    gap: 6,
    backgroundColor: '#fbfcfd',
  },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dutyNote: {
    fontSize: 11,
    fontFamily: 'Manrope_500Medium',
    color: '#b45309',
    marginTop: 2,
  },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupOrdinal: {
    width: 18,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#94a3b8',
  },
  groupAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  groupAddText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    color: '#0369a1',
  },
  placeBtn: { padding: 4 },
  dialogText: { fontSize: 15, color: '#0f172a', lineHeight: 21 },
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
