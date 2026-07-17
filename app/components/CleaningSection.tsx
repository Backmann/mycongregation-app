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
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMyPublisher } from '../lib/useMyPublisher';
import { HallPlan } from './HallPlan';
import { TimeField } from './TimeField';
import { MyBulb } from './MyBulb';
import { MyGlowRow } from './MyGlowRow';
import { ChipRow, PersonChip } from './PersonChip';
import {
  CleaningAssignment,
  CleaningSlotType,
  Publisher,
  ServiceGroup,
  cleaningApi,
  extractErrorMessage,
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
  /** Monday (YYYY-MM-DD) of the week the assignments belong to. */
  weekStart: string;
  onSetSlot: (
    slotType: CleaningSlotType,
    serviceGroupId: string | null,
    windows?: number[] | null,
  ) => void;
  onClearSlot: (slotType: CleaningSlotType) => void;
  hideHeader?: boolean;
};

export function CleaningSection({
  assignments,
  publishersById,
  canEdit,
  pending,
  weekStart,
  onSetSlot,
  onClearSlot,
  hideHeader,
}: Props) {
  const { t } = useTranslation();
  const { myPublisher } = useMyPublisher();
  const myGroupId = myPublisher?.serviceGroupId ?? null;

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
      {!hideHeader ? (
        <View style={styles.header}>
          <Ionicons name="sparkles-outline" size={16} color="#475569" />
          <Text style={styles.headerText}>{t('cleaning.title')}</Text>
        </View>
      ) : null}

      <View style={styles.stack}>
        {GROUP_SLOTS.map((slot) => {
          const assigned = bySlot.get(slot) ?? null;
          const group = assigned?.serviceGroupId
            ? groupsById.get(assigned.serviceGroupId) ?? null
            : null;
          const overseer = overseerName(group, publishersById);
          const isMine =
            !!myGroupId && assigned?.serviceGroupId === myGroupId;
          const isThorough = slot === 'thorough';
          const accent = isThorough ? '#0891b2' : '#0ea5e9';
          const RowWrap = isMine ? MyGlowRow : View;
          return (
            <RowWrap
              key={slot}
              style={[styles.slotCard, isMine && styles.slotCardMineGlow]}
            >
              <View style={styles.slotCardHead}>
                <View
                  style={[styles.slotIcon, { backgroundColor: `${accent}14` }]}
                >
                  <Ionicons
                    name={
                      isThorough
                        ? 'sparkles-outline'
                        : 'refresh-circle-outline'
                    }
                    size={16}
                    color={accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.slotTitleRow}>
                    {isMine ? <MyBulb size={13} /> : null}
                    <Text style={styles.slotCardTitle}>
                      {t(`cleaning.slots.${slot}`)}
                    </Text>
                  </View>
                  <Text style={styles.slotCardHint}>
                    {t(`cleaning.slotHints.${slot}`)}
                  </Text>
                </View>
              </View>

              <View style={styles.slotCardBody}>
                {canEdit ? (
                  <GroupSelect
                    title={t(`cleaning.slots.${slot}`)}
                    value={assigned?.serviceGroupId ?? null}
                    groups={groups}
                    publishersById={publishersById}
                    disabled={pending}
                    onChange={(id) =>
                      id
                        ? onSetSlot(
                            slot,
                            id,
                            isThorough
                              ? (assigned?.windows ?? null)
                              : undefined,
                          )
                        : onClearSlot(slot)
                    }
                  />
                ) : (
                  <ChipRow>
                    {group ? (
                      <PersonChip label={group.name} variant="group" />
                    ) : (
                      <PersonChip label={t('cleaning.empty')} variant="empty" />
                    )}
                    {!!overseer && (
                      <PersonChip label={overseer} variant="assistant" />
                    )}
                  </ChipRow>
                )}

                {isThorough ? (
                  <ThoroughExtras
                    assignment={assigned}
                    group={group}
                    canEdit={canEdit}
                    pending={pending}
                    weekStart={weekStart}
                    myPublisherId={myPublisher?.id ?? null}
                    onSetWindows={(w) =>
                      onSetSlot('thorough', assigned?.serviceGroupId ?? null, w)
                    }
                  />
                ) : null}

                <GuideLink freq={isThorough ? 'weekly' : 'zsk'} />
              </View>
            </RowWrap>
          );
        })}

        {/* General cleaning — once a year, whole congregation */}
        <View style={styles.slotCard}>
          <View style={styles.slotCardHead}>
            <View style={[styles.slotIcon, { backgroundColor: '#f59e0b14' }]}>
              <Ionicons name="calendar-outline" size={16} color="#d97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.slotCardTitle}>
                {t('cleaning.slots.general')}
              </Text>
              <Text style={styles.slotCardHint}>
                {t('cleaning.allCongregation')}
              </Text>
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
              <View
                style={[
                  styles.generalBadge,
                  !generalOn && styles.generalBadgeOff,
                ]}
              >
                <Text
                  style={[
                    styles.generalBadgeText,
                    !generalOn && styles.generalBadgeTextOff,
                  ]}
                >
                  {generalOn
                    ? t('cleaning.scheduled')
                    : t('cleaning.empty')}
                </Text>
              </View>
            )}
          </View>

          {generalOn ? (
            <GeneralExtras
              assignment={bySlot.get('general') ?? null}
              canEdit={canEdit}
              pending={pending}
              weekStart={weekStart}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Small link to the illustrated guide, opened on the given frequency. */
function GuideLink({ freq }: { freq: 'zsk' | 'weekly' | 'yearly' }) {
  const { t } = useTranslation();
  return (
    <Pressable
      style={styles.guideLinkRow}
      onPress={() => router.push(`/cleaning/guide?freq=${freq}` as any)}
      hitSlop={6}
    >
      <Ionicons name="book-outline" size={13} color="#0369a1" />
      <Text style={styles.guideLinkText}>
        {t(`cleaning.guideLinks.${freq}`)}
      </Text>
      <Ionicons name="chevron-forward" size={12} color="#94a3b8" />
    </Pressable>
  );
}

/**
 * Extras under the general (annual) cleaning row: the congregation-wide date
 * and time. Set by the cleaning coordinator; drives a 2h-before push to the
 * whole congregation. Reuses the week-day-chips + time-wheel pattern of the
 * thorough plan modal.
 */
function GeneralExtras({
  assignment,
  canEdit,
  pending,
  weekStart,
}: {
  assignment: CleaningAssignment | null;
  canEdit: boolean;
  pending?: boolean;
  weekStart: string;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draftDay, setDraftDay] = useState<string>('');
  const [draftTime, setDraftTime] = useState<string>('10:00');
  const [planError, setPlanError] = useState<string | null>(null);

  const plannedAt = assignment?.thoroughPlannedAt ?? null;

  const mutation = useMutation({
    mutationFn: (plannedAtIso: string | null) =>
      cleaningApi.planGeneral({
        weekStartDate: weekStart,
        plannedAt: plannedAtIso,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cleaning', weekStart] });
      setOpen(false);
      setPlanError(null);
    },
    onError: (e) => setPlanError(extractErrorMessage(e)),
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() + i);
    return d;
  });

  const openModal = () => {
    if (plannedAt) {
      const d = new Date(plannedAt);
      setDraftDay(isoDate(d));
      setDraftTime(
        `${String(d.getHours()).padStart(2, '0')}:${String(
          d.getMinutes(),
        ).padStart(2, '0')}`,
      );
    } else {
      setDraftDay('');
      setDraftTime('10:00');
    }
    setPlanError(null);
    setOpen(true);
  };

  const fmtPlanned = (iso: string) => {
    const d = new Date(iso);
    const day = d.toLocaleDateString(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const time = d.toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${day}, ${time}`;
  };

  return (
    <View style={styles.slotCardBody}>
      <View style={styles.extras}>
        <View style={styles.extraItem}>
          <Text style={styles.extraLabel}>
            {t('cleaning.plan.generalLabel')}
          </Text>
          <View style={styles.extraContent}>
            {plannedAt ? (
              <Text style={styles.extraValue}>{fmtPlanned(plannedAt)}</Text>
            ) : (
              <Text style={styles.extraMuted}>{t('cleaning.plan.tbd')}</Text>
            )}
            {canEdit ? (
              <Pressable
                disabled={pending}
                onPress={openModal}
                hitSlop={8}
                style={styles.extraBtn}
              >
                <Ionicons
                  name="calendar-clear-outline"
                  size={13}
                  color="#0369a1"
                />
                <Text style={styles.extraAction}>
                  {plannedAt ? t('common.edit') : t('cleaning.plan.set')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <GuideLink freq="yearly" />

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t('cleaning.plan.generalTitle')}
            </Text>
            <View style={styles.dayRow}>
              {weekDays.map((d) => {
                const iso = isoDate(d);
                const active = iso === draftDay;
                return (
                  <Pressable
                    key={iso}
                    style={[styles.dayChip, active && styles.dayChipActive]}
                    onPress={() => setDraftDay(iso)}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        active && styles.dayChipTextActive,
                      ]}
                    >
                      {d.toLocaleDateString(i18n.language, {
                        weekday: 'short',
                      })}
                    </Text>
                    <Text
                      style={[
                        styles.dayChipNum,
                        active && styles.dayChipTextActive,
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TimeField value={draftTime} onChange={setDraftTime} />
            {planError ? (
              <Text style={styles.planError}>{planError}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setOpen(false)}>
                <Text style={styles.modalBtnText}>{t('common.cancel')}</Text>
              </Pressable>
              {plannedAt ? (
                <Pressable
                  style={styles.modalBtn}
                  disabled={mutation.isPending}
                  onPress={() => mutation.mutate(null)}
                >
                  <Text style={[styles.modalBtnText, styles.modalBtnDanger]}>
                    {t('cleaning.plan.clear')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  (!draftDay || !draftTime) && styles.modalBtnDisabled,
                ]}
                disabled={!draftDay || !draftTime || mutation.isPending}
                onPress={() =>
                  mutation.mutate(
                    new Date(`${draftDay}T${draftTime}:00`).toISOString(),
                  )
                }
              >
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>
                  {t('common.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Local YYYY-MM-DD for a Date. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Extras under the weekly (thorough) slot row: which hall-plan windows to
 * wash this week (coordinator picks them on the interactive plan) and the
 * day the assigned group plans to clean (set by the coordinator OR the
 * overseer of the assigned group; the server enforces the same rule).
 */
function ThoroughExtras({
  assignment,
  group,
  canEdit,
  pending,
  weekStart,
  myPublisherId,
  onSetWindows,
}: {
  assignment: CleaningAssignment | null;
  group: ServiceGroup | null;
  canEdit: boolean;
  pending?: boolean;
  weekStart: string;
  myPublisherId: string | null;
  onSetWindows: (windows: number[] | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [windowsOpen, setWindowsOpen] = useState(false);
  const [draftWindows, setDraftWindows] = useState<number[]>([]);
  const [planOpen, setPlanOpen] = useState(false);
  const [draftDay, setDraftDay] = useState<string>('');
  const [draftTime, setDraftTime] = useState<string>('18:00');
  const [planError, setPlanError] = useState<string | null>(null);

  const windows = assignment?.windows ?? [];
  const plannedAt = assignment?.thoroughPlannedAt ?? null;
  const hasGroup = !!assignment?.serviceGroupId;
  const isMyGroupOverseer =
    !!myPublisherId && group?.overseerPublisherId === myPublisherId;
  const canPlan = hasGroup && (canEdit || isMyGroupOverseer);

  const planMutation = useMutation({
    mutationFn: (plannedAtIso: string | null) =>
      cleaningApi.planThorough({
        weekStartDate: weekStart,
        plannedAt: plannedAtIso,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cleaning', weekStart] });
      setPlanOpen(false);
      setPlanError(null);
    },
    onError: (e) => setPlanError(extractErrorMessage(e)),
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() + i);
    return d;
  });

  const openPlan = () => {
    if (plannedAt) {
      const d = new Date(plannedAt);
      setDraftDay(isoDate(d));
      setDraftTime(
        `${String(d.getHours()).padStart(2, '0')}:${String(
          d.getMinutes(),
        ).padStart(2, '0')}`,
      );
    } else {
      setDraftDay('');
      setDraftTime('18:00');
    }
    setPlanError(null);
    setPlanOpen(true);
  };

  const fmtPlanned = (iso: string) => {
    const d = new Date(iso);
    const day = d.toLocaleDateString(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const time = d.toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${day}, ${time}`;
  };

  if (!canEdit && !assignment) return null;

  return (
    <View style={styles.extras}>
      <View style={styles.extraItem}>
        <Text style={styles.extraLabel}>{t('cleaning.windows.label')}</Text>
        <View style={styles.extraContent}>
          {windows.length > 0 ? (
            <View style={styles.windowChips}>
              {windows.map((n) => (
                <View key={n} style={styles.windowChip}>
                  <Text style={styles.windowChipText}>{n}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.extraMuted}>{t('cleaning.windows.none')}</Text>
          )}
          {canEdit ? (
            <Pressable
              disabled={pending}
              onPress={() => {
                setDraftWindows(windows);
                setWindowsOpen(true);
              }}
              hitSlop={8}
              style={styles.extraBtn}
            >
              <Ionicons name="map-outline" size={13} color="#0369a1" />
              <Text style={styles.extraAction}>
                {t('cleaning.windows.edit')}
              </Text>
            </Pressable>
          ) : windows.length > 0 ? (
            <Pressable
              onPress={() => setWindowsOpen(true)}
              hitSlop={8}
              style={styles.extraBtn}
            >
              <Ionicons name="map-outline" size={13} color="#0369a1" />
              <Text style={styles.extraAction}>
                {t('cleaning.windows.map')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {hasGroup ? (
        <View style={styles.extraItem}>
          <Text style={styles.extraLabel}>{t('cleaning.plan.label')}</Text>
          <View style={styles.extraContent}>
            {plannedAt ? (
              <Text style={styles.extraValue}>{fmtPlanned(plannedAt)}</Text>
            ) : (
              <Text style={styles.extraMuted}>{t('cleaning.plan.tbd')}</Text>
            )}
            {canPlan ? (
              <Pressable
                disabled={pending}
                onPress={openPlan}
                hitSlop={8}
                style={styles.extraBtn}
              >
                <Ionicons
                  name="calendar-clear-outline"
                  size={13}
                  color="#0369a1"
                />
                <Text style={styles.extraAction}>
                  {plannedAt ? t('common.edit') : t('cleaning.plan.set')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Окна: карта зала */}
      <Modal
        visible={windowsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setWindowsOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t('cleaning.windows.title')}
            </Text>
            {canEdit ? (
              <Text style={styles.modalHint}>
                {t('cleaning.windows.hint')}
              </Text>
            ) : null}
            <HallPlan
              selected={canEdit ? draftWindows : windows}
              onToggle={
                canEdit
                  ? (num) =>
                      setDraftWindows((cur) =>
                        cur.includes(num)
                          ? cur.filter((n) => n !== num)
                          : [...cur, num].sort((a, b) => a - b),
                      )
                  : undefined
              }
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalBtn}
                onPress={() => setWindowsOpen(false)}
              >
                <Text style={styles.modalBtnText}>
                  {canEdit ? t('common.cancel') : t('common.close')}
                </Text>
              </Pressable>
              {canEdit ? (
                <Pressable
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  disabled={pending}
                  onPress={() => {
                    onSetWindows(
                      draftWindows.length > 0 ? draftWindows : null,
                    );
                    setWindowsOpen(false);
                  }}
                >
                  <Text
                    style={[styles.modalBtnText, styles.modalBtnTextPrimary]}
                  >
                    {t('common.save')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* День еженедельной уборки */}
      <Modal
        visible={planOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPlanOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('cleaning.plan.title')}</Text>
            <View style={styles.dayRow}>
              {weekDays.map((d) => {
                const iso = isoDate(d);
                const active = iso === draftDay;
                return (
                  <Pressable
                    key={iso}
                    style={[styles.dayChip, active && styles.dayChipActive]}
                    onPress={() => setDraftDay(iso)}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        active && styles.dayChipTextActive,
                      ]}
                    >
                      {d.toLocaleDateString(i18n.language, {
                        weekday: 'short',
                      })}
                    </Text>
                    <Text
                      style={[
                        styles.dayChipNum,
                        active && styles.dayChipTextActive,
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TimeField value={draftTime} onChange={setDraftTime} />
            {planError ? (
              <Text style={styles.planError}>{planError}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalBtn}
                onPress={() => setPlanOpen(false)}
              >
                <Text style={styles.modalBtnText}>{t('common.cancel')}</Text>
              </Pressable>
              {plannedAt ? (
                <Pressable
                  style={styles.modalBtn}
                  disabled={planMutation.isPending}
                  onPress={() => planMutation.mutate(null)}
                >
                  <Text style={[styles.modalBtnText, styles.modalBtnDanger]}>
                    {t('cleaning.plan.clear')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  (!draftDay || !draftTime) && styles.modalBtnDisabled,
                ]}
                disabled={!draftDay || !draftTime || planMutation.isPending}
                onPress={() =>
                  planMutation.mutate(
                    new Date(`${draftDay}T${draftTime}:00`).toISOString(),
                  )
                }
              >
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>
                  {t('common.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stack: {
    marginHorizontal: 12,
    gap: 8,
  },
  slotCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  slotCardMineGlow: { marginVertical: 2 },
  slotCardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slotIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slotCardTitle: { fontSize: 14.5, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  slotCardHint: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  slotCardBody: { marginTop: 10, gap: 10 },
  generalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#6ee7b7',
  },
  generalBadgeOff: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  generalBadgeText: { fontSize: 12, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#047857' },
  generalBadgeTextOff: { color: '#cbd5e1' },
  extras: {
    marginTop: 2,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#eef2f7',
    gap: 9,
  },
  extraItem: { gap: 5 },
  extraLabel: {
    fontSize: 10.5,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  extraContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  extraMuted: { flex: 1, fontSize: 13, color: '#94a3b8' },
  extraValue: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    textTransform: 'capitalize',
  },
  extraBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  extraAction: { fontSize: 12.5, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0369a1' },
  windowChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  windowChip: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  windowChipText: { fontSize: 12, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold', color: '#b45309' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    gap: 10,
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold', color: '#0f172a' },
  modalHint: { fontSize: 12.5, color: '#64748b', marginTop: -4 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  modalBtnPrimary: { backgroundColor: '#0369a1' },
  modalBtnDisabled: { opacity: 0.45 },
  modalBtnText: { fontSize: 13.5, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#334155' },
  modalBtnTextPrimary: { color: '#fff' },
  modalBtnDanger: { color: '#b91c1c' },
  dayRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  dayChip: {
    minWidth: 44,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  dayChipActive: { backgroundColor: '#0369a1', borderColor: '#0369a1' },
  dayChipText: {
    fontSize: 11,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    textTransform: 'capitalize',
  },
  dayChipNum: { fontSize: 13.5, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold', color: '#0f172a' },
  dayChipTextActive: { color: '#fff' },
  planError: { fontSize: 12.5, color: '#b91c1c' },
  guideLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  guideLinkText: { fontSize: 12.5, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0369a1' },

  slotRowMine: { backgroundColor: '#fffbeb' },
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
  pickerTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
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
  pickerClear: { fontSize: 15, color: '#64748b', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  noGroups: { fontSize: 13, color: '#94a3b8', paddingVertical: 12 },
});
