import { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useMyPublisher } from '../lib/useMyPublisher';
import { MyBulb } from './MyBulb';
import { ChipRow, PersonChip } from './PersonChip';
import {
  CreateFieldServiceMeetingInput,
  FieldServiceMeeting,
  Publisher,
  UpdateFieldServiceMeetingInput,
  hallsApi,
  fieldServiceStatsApi,
} from '../lib/api';
import { PublisherSelector } from './PublisherSelector';
import { TimeWheel } from './TimeWheel';
import { MonthCalendar } from './MonthCalendar';
import {
  startOfWeekMonday,
  formatDateISO,
  parseISODate,
  addDays,
} from '../lib/dates';

/** Monday (ISO) of the week containing the given date. */
function mondayOf(dateISO: string): string {
  return formatDateISO(startOfWeekMonday(parseISODate(dateISO)));
}
/** ISO weekday 1=Mon..7=Sun for the given date. */
function isoDow(dateISO: string): number {
  const d = parseISODate(dateISO).getDay();
  return d === 0 ? 7 : d;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function sortMeetings(a: FieldServiceMeeting, b: FieldServiceMeeting): number {
  return a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime);
}

type Props = {
  meetings: FieldServiceMeeting[];
  publishersById: Map<string, Publisher>;
  canEdit: boolean;
  weekStartISO: string;
  onCreate: (input: CreateFieldServiceMeetingInput) => void;
  onUpdate: (id: string, input: UpdateFieldServiceMeetingInput) => void;
  onRemove: (id: string) => void;
  pending?: boolean;
  hideHeader?: boolean;
};

export function FieldServiceSection({
  meetings,
  publishersById,
  canEdit,
  weekStartISO,
  onCreate,
  onUpdate,
  onRemove,
  pending,
  hideHeader,
}: Props) {
  const { t } = useTranslation();
  const { myPublisherId } = useMyPublisher();
  const [formFor, setFormFor] = useState<FieldServiceMeeting | 'new' | null>(
    null,
  );

  if (meetings.length === 0 && !canEdit) return null;

  const list = meetings.slice().sort(sortMeetings);

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.section}>
      {!hideHeader ? (
        <View style={styles.header}>
          <Ionicons name="megaphone-outline" size={16} color="#475569" />
          <Text style={styles.headerText}>{t('fieldService.title')}</Text>
        </View>
      ) : null}

      {list.length === 0 ? (
        <Text style={styles.empty}>{t('fieldService.empty')}</Text>
      ) : (
        <View style={styles.rows}>
          {list.map((m) => {
            const conductor = m.conductorPublisherId
              ? publishersById.get(m.conductorPublisherId) ?? null
              : null;
            const isMine =
              !!myPublisherId && m.conductorPublisherId === myPublisherId;
            return (
              <View key={m.id} style={[styles.row, isMine && styles.rowMine]}>
                <View style={styles.rowMain}>
                  <Text style={styles.when}>
                    {t(`fieldService.days.${m.dayOfWeek}`)} · {m.startTime}
                  </Text>
                  {m.isGeneral ? (
                    <View style={styles.generalBadge}>
                      <Ionicons name="people" size={12} color="#7c3aed" />
                      <Text style={styles.generalBadgeText}>
                        {t('fieldService.generalBadge')}
                      </Text>
                    </View>
                  ) : null}
                  <ChipRow>
                    {isMine ? <MyBulb size={15} /> : null}
                    {conductor ? (
                      <PersonChip
                        label={conductor.displayName}
                        variant="main"
                      />
                    ) : (
                      <PersonChip
                        label={t('fieldService.unassigned')}
                        variant="empty"
                      />
                    )}
                  </ChipRow>
                  <Text style={styles.address} numberOfLines={2}>
                    {m.address}
                  </Text>
                  {!!m.topic && (
                    <Text style={styles.topic} numberOfLines={3}>
                      {m.topic}
                    </Text>
                  )}
                  {!!m.sourceUrl && (
                    <Pressable
                      onPress={() => openLink(m.sourceUrl as string)}
                      hitSlop={6}
                    >
                      <Text style={styles.link} numberOfLines={1}>
                        <Ionicons
                          name="link-outline"
                          size={13}
                          color="#0369a1"
                        />{' '}
                        {t('fieldService.openLink')}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {canEdit && (
                  <View style={styles.rowActions}>
                    <Pressable
                      onPress={() => setFormFor(m)}
                      hitSlop={8}
                      style={styles.iconBtn}
                      disabled={pending}
                    >
                      <Ionicons name="create-outline" size={20} color="#0369a1" />
                    </Pressable>
                    <Pressable
                      onPress={() => onRemove(m.id)}
                      hitSlop={8}
                      style={styles.iconBtn}
                      disabled={pending}
                    >
                      <Ionicons name="trash-outline" size={20} color="#dc2626" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {canEdit && (
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          onPress={() => setFormFor('new')}
        >
          <Ionicons name="add-circle-outline" size={16} color="#0369a1" />
          <Text style={styles.addBtnText}>{t('fieldService.addEntry')}</Text>
        </Pressable>
      )}

      <FieldServiceForm
        target={formFor}
        weekStartISO={weekStartISO}
        weekConductorIds={(week, excludeId) =>
          meetings
            .filter(
              (m) =>
                m.weekStartDate === week &&
                m.id !== excludeId &&
                !!m.conductorPublisherId,
            )
            .map((m) => m.conductorPublisherId as string)
        }
        onClose={() => setFormFor(null)}
        onCreate={(input) => {
          onCreate(input);
          setFormFor(null);
        }}
        onUpdate={(id, input) => {
          onUpdate(id, input);
          setFormFor(null);
        }}
      />
    </View>
  );
}

export function FieldServiceForm({
  target,
  weekStartISO,
  onClose,
  onCreate,
  onUpdate,
  pickDate = false,
  defaultDate,
  weekConductorIds,
}: {
  target: FieldServiceMeeting | 'new' | null;
  weekStartISO: string;
  onClose: () => void;
  onCreate: (input: CreateFieldServiceMeetingInput) => void;
  onUpdate: (id: string, input: UpdateFieldServiceMeetingInput) => void;
  /** When true (e.g. the month page), pick a full date instead of a weekday. */
  pickDate?: boolean;
  /** Default date (ISO) to preselect in date-pick mode. */
  defaultDate?: string;
  /**
   * Returns conductor ids already assigned in a given week (excluding one
   * meeting id), so the form can warn about double-booking the same week.
   */
  weekConductorIds?: (weekStartISO: string, excludeMeetingId?: string) => string[];
}) {
  const { t, i18n } = useTranslation();
  const editing = target && target !== 'new' ? target : null;
  const visible = target !== null;

  const hallsQuery = useQuery({
    queryKey: ['halls'],
    queryFn: () => hallsApi.list(),
    enabled: visible,
  });
  const halls = hallsQuery.data ?? [];

  const conductorStatsQuery = useQuery({
    queryKey: ['field-service-conductor-stats'],
    queryFn: () => fieldServiceStatsApi.conductorStats(),
    enabled: visible,
  });
  const topicHistoryQuery = useQuery({
    queryKey: ['field-service-topic-history'],
    queryFn: () => fieldServiceStatsApi.topicHistory(),
    enabled: visible,
  });

  const [dayOfWeek, setDayOfWeek] = useState<number>(2);
  const [startTime, setStartTime] = useState('');
  const [address, setAddress] = useState('');
  const [conductorPublisherId, setConductorPublisherId] = useState<
    string | null
  >(null);
  const [topic, setTopic] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [isGeneral, setIsGeneral] = useState(false);
  const [pickedDate, setPickedDate] = useState<string>('');

  useEffect(() => {
    if (target === 'new') {
      setDayOfWeek(2);
      setStartTime('10:30');
      setAddress('');
      setConductorPublisherId(null);
      setTopic('');
      setSourceUrl('');
      setIsGeneral(false);
      setPickedDate(defaultDate ?? '');
    } else if (target) {
      setDayOfWeek(target.dayOfWeek);
      setStartTime(target.startTime);
      setAddress(target.address);
      setConductorPublisherId(target.conductorPublisherId);
      setTopic(target.topic ?? '');
      setSourceUrl(target.sourceUrl ?? '');
      setIsGeneral(target.isGeneral);
      setPickedDate('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Prefill a brand-new meeting with the default hall address — once,
  // and only while the field is still empty (a cleared field stays cleared).
  useEffect(() => {
    if (target === 'new' && address === '' && halls.length > 0) {
      const def = halls.find((h) => h.isDefault) ?? halls[0];
      setAddress(def.address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, hallsQuery.data]);

  const canSave =
    address.trim().length > 0 &&
    TIME_RE.test(startTime) &&
    (!pickDate || !!editing || !!pickedDate);

  // ---- Rotation / topic hints (advisory) ----
  const fmtDate = (iso: string) => iso.split('-').reverse().join('.');
  const effectiveWeek = editing
    ? editing.weekStartDate
    : pickDate && pickedDate
      ? mondayOf(pickedDate)
      : weekStartISO;
  const selectedStat = conductorPublisherId
    ? (conductorStatsQuery.data?.find(
        (c) => c.conductorPublisherId === conductorPublisherId,
      ) ?? null)
    : null;
  const doubleBooked =
    !!conductorPublisherId &&
    !!weekConductorIds &&
    weekConductorIds(effectiveWeek, editing?.id).includes(conductorPublisherId);
  const editingDate = editing
    ? formatDateISO(
        addDays(parseISODate(editing.weekStartDate), editing.dayOfWeek - 1),
      )
    : null;
  const topicMatch = (() => {
    const tt = topic.trim().toLowerCase();
    if (!tt) return null;
    const hit = topicHistoryQuery.data?.find(
      (e) => e.topic.trim().toLowerCase() === tt,
    );
    if (!hit) return null;
    // Don't flag a meeting against its own only-occurrence when editing.
    if (editingDate && hit.lastDate === editingDate) return null;
    return hit;
  })();

  const submit = () => {
    if (!canSave) return;
    const base = {
      dayOfWeek,
      startTime,
      address: address.trim(),
      conductorPublisherId,
      topic: topic.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
      isGeneral,
    };
    if (editing) {
      onUpdate(editing.id, base);
    } else if (pickDate && pickedDate) {
      onCreate({
        ...base,
        weekStartDate: mondayOf(pickedDate),
        dayOfWeek: isoDow(pickedDate),
      });
    } else {
      onCreate({ weekStartDate: weekStartISO, ...base });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
        />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {editing ? t('fieldService.form.editTitle') : t('fieldService.form.addTitle')}
          </Text>

          <ScrollView
            style={styles.formScroll}
            keyboardShouldPersistTaps="handled"
          >
            {pickDate && !editing ? (
              <>
                <Text style={styles.fieldLabel}>
                  {t('fieldService.form.dateLabel')}
                </Text>
                <MonthCalendar
                  mode="single"
                  start={pickedDate || null}
                  end={null}
                  onChange={({ start }) => start && setPickedDate(start)}
                  locale={i18n.language}
                />
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>
                  {t('fieldService.dayLabel')}
                </Text>
                <View style={styles.dayRow}>
                  {DAYS.map((d) => {
                    const selected = d === dayOfWeek;
                    return (
                      <Pressable
                        key={d}
                        onPress={() => setDayOfWeek(d)}
                        style={[styles.dayChip, selected && styles.dayChipOn]}
                      >
                        <Text
                          style={[
                            styles.dayChipText,
                            selected && styles.dayChipTextOn,
                          ]}
                        >
                          {t(`fieldService.days.${d}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>{t('fieldService.timeLabel')}</Text>
            <TimeWheel value={startTime} onChange={setStartTime} />

            <Text style={styles.fieldLabel}>{t('fieldService.addressLabel')}</Text>
            {halls.length > 0 && (
              <View style={styles.hallChips}>
                {halls.map((h) => {
                  const active = address.trim() === h.address;
                  return (
                    <Pressable
                      key={h.id}
                      style={[
                        styles.hallChip,
                        active && styles.hallChipActive,
                      ]}
                      onPress={() => setAddress(h.address)}
                    >
                      <Text
                        style={[
                          styles.hallChipText,
                          active && styles.hallChipTextActive,
                        ]}
                      >
                        {h.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder={t('fieldService.form.addressPlaceholder')}
              placeholderTextColor="#94a3b8"
              maxLength={255}
            />

            <PublisherSelector
              label={t('fieldService.conductor')}
              value={conductorPublisherId}
              onChange={setConductorPublisherId}
            />
            {conductorPublisherId ? (
              <>
                <Text style={styles.statHint}>
                  {selectedStat
                    ? [
                        t('fieldService.stat.total', {
                          count: selectedStat.total,
                        }),
                        selectedStat.lastDate
                          ? t('fieldService.stat.last', {
                              date: fmtDate(selectedStat.lastDate),
                            })
                          : t('fieldService.stat.never'),
                        selectedStat.nextDate
                          ? t('fieldService.stat.next', {
                              date: fmtDate(selectedStat.nextDate),
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join('  ·  ')
                    : t('fieldService.stat.firstTime')}
                </Text>
                {doubleBooked ? (
                  <Text style={styles.warnHint}>
                    {t('fieldService.doubleWeek')}
                  </Text>
                ) : null}
              </>
            ) : null}

            <Text style={styles.fieldLabel}>{t('fieldService.topicLabel')}</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={topic}
              onChangeText={setTopic}
              placeholder={t('fieldService.form.topicPlaceholder')}
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={2000}
            />
            {topicMatch ? (
              <Text style={styles.statHint}>
                {t('fieldService.topicUsed', {
                  date: fmtDate(topicMatch.lastDate),
                })}
              </Text>
            ) : null}

            <Text style={styles.fieldLabel}>{t('fieldService.linkLabel')}</Text>
            <TextInput
              style={styles.input}
              value={sourceUrl}
              onChangeText={setSourceUrl}
              placeholder={t('fieldService.form.linkPlaceholder')}
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              maxLength={2000}
            />

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>
                  {t('fieldService.isGeneral')}
                </Text>
                <Text style={styles.toggleHint}>
                  {t('fieldService.isGeneralHint')}
                </Text>
              </View>
              <Switch
                value={isGeneral}
                onValueChange={setIsGeneral}
                trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }}
              />
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancel} onPress={onClose}>
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.modalConfirm, !canSave && styles.disabled]}
              onPress={submit}
              disabled={!canSave}
            >
              <Text style={styles.modalConfirmText}>
                {t('fieldService.form.save')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hallChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  hallChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hallChipActive: {
    borderColor: '#0ea5e9',
    backgroundColor: '#e0f2fe',
  },
  hallChipText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  hallChipTextActive: { color: '#0369a1' },
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
  empty: {
    fontSize: 13,
    color: '#94a3b8',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  rows: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    gap: 10,
  },
  rowMain: { flex: 1, gap: 2 },
  when: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  generalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    backgroundColor: '#f3e8ff',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 4,
  },
  generalBadgeText: { fontSize: 11, fontWeight: '700', color: '#7c3aed' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  toggleHint: { fontSize: 12, color: '#64748b', marginTop: 2 },
  rowMine: { backgroundColor: '#fffbeb' },
  address: { fontSize: 13, color: '#475569' },
  topic: { fontSize: 13, color: '#64748b', fontStyle: 'italic' },
  link: { fontSize: 13, color: '#0369a1', fontWeight: '600', marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 2 },
  iconBtn: { padding: 4 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#bae6fd',
    backgroundColor: '#f8fafc',
  },
  addBtnPressed: { backgroundColor: '#e0f2fe' },
  addBtnText: { fontSize: 14, fontWeight: '600', color: '#0369a1' },

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
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  formScroll: { maxHeight: 420 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginTop: 10,
    marginBottom: 4,
  },
  statHint: {
    fontSize: 12,
    color: '#0369a1',
    marginTop: 6,
    fontWeight: '600',
  },
  warnHint: {
    fontSize: 12,
    color: '#b45309',
    marginTop: 4,
    fontWeight: '700',
  },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  dayChipOn: { borderColor: '#0ea5e9', backgroundColor: '#e0f2fe' },
  dayChipText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  dayChipTextOn: { color: '#0369a1' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
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
  disabled: { opacity: 0.5 },
});
