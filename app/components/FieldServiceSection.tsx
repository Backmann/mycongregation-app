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
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import { useQuery } from '@tanstack/react-query';
import { useMyPublisher } from '../lib/useMyPublisher';
import { MyDot } from './MyDot';
import { MyGlowRow } from './MyGlowRow';
import { ChipRow, PersonChip } from './PersonChip';
import {
  CoVisitFieldServiceMeeting,
  CreateFieldServiceMeetingInput,
  FieldServiceMeeting,
  Publisher,
  UpdateFieldServiceMeetingInput,
  hallsApi,
  fieldServiceStatsApi,
  specialEventsApi,
  publishersApi,
  absencesApi,
  serviceGroupsApi,
  responsibilitiesApi,
} from '../lib/api';
import { resolveHallAddress } from '../lib/hallAddress';
import { PublisherSelector } from './PublisherSelector';
import { TimeField } from './TimeField';
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

/** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
function isoDayOf(dateISO: string): number {
  const day = new Date(`${dateISO}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

function sortMeetings(a: FieldServiceMeeting, b: FieldServiceMeeting): number {
  return a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime);
}

type Props = {
  meetings: FieldServiceMeeting[];
  /**
   * Outings planned inside a circuit-overseer visit, already narrowed to this
   * week by the caller. During a visit the week's field service lives in the
   * visit schedule instead of here, which is why this section used to stand
   * empty exactly when there was the most going on.
   */
  visitMeetings?: CoVisitFieldServiceMeeting[];
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
  visitMeetings = [],
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
  // Halls: resolve shorthand meeting addresses to the exact hall address.
  const sectionHallsQuery = useQuery({
    queryKey: ['halls'],
    queryFn: () => hallsApi.list(),
    staleTime: 5 * 60 * 1000,
  });
  const sectionHalls = sectionHallsQuery.data ?? [];
  const [formFor, setFormFor] = useState<FieldServiceMeeting | 'new' | null>(
    null,
  );

  if (meetings.length === 0 && visitMeetings.length === 0 && !canEdit)
    return null;

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

      {list.length === 0 && visitMeetings.length === 0 ? (
        <Text style={styles.empty}>{t('fieldService.empty')}</Text>
      ) : (
        <View style={styles.rows}>
          {list.map((m) => {
            const conductor = m.conductorPublisherId
              ? publishersById.get(m.conductorPublisherId) ?? null
              : null;
            const isMine =
              !!myPublisherId && m.conductorPublisherId === myPublisherId;
            const RowWrap = isMine ? MyGlowRow : View;
            return (
              <RowWrap
                key={m.id}
                kind="field_service"
                style={[styles.row, isMine && styles.rowMineGlow]}
              >
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
                  {/* The group should know he is coming — Lionel asked for
                      this to be visible to publishers, not kept among the
                      elders. It sits on the meeting itself, where the group
                      already looks to see where and when. */}
                  {m.serviceOverseerVisit ? (
                    <View style={styles.visitBadge}>
                      <Ionicons name="walk" size={12} color="#0e7490" />
                      <Text style={styles.visitBadgeText}>
                        {t('fieldService.overseerVisitBadge')}
                      </Text>
                    </View>
                  ) : null}
                  <ChipRow>
                    {isMine ? <MyDot kind="field_service" /> : null}
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
                    {resolveHallAddress(m.address, sectionHalls)}
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
              </RowWrap>
            );
          })}
        </View>
      )}

      {visitMeetings.length > 0 ? (
        <View style={styles.visitBlock}>
          <View style={styles.visitHead}>
            <Ionicons name="briefcase-outline" size={14} color="#0e7490" />
            <Text style={styles.visitHeadText}>
              {t('fieldService.fromCoVisit')}
            </Text>
          </View>
          {[...visitMeetings]
            .sort(
              (a, b) =>
                a.itemDate.localeCompare(b.itemDate) ||
                (a.startTime ?? '').localeCompare(b.startTime ?? ''),
            )
            .map((m) => (
              <View key={m.id} style={styles.visitRow}>
                <Text style={styles.when}>
                  {t(`fieldService.days.${isoDayOf(m.itemDate)}`)}
                  {m.startTime ? ` \u00b7 ${m.startTime}` : ''}
                </Text>
                {m.place ? (
                  <Text style={styles.address} numberOfLines={2}>
                    {resolveHallAddress(m.place, sectionHalls)}
                  </Text>
                ) : null}
              </View>
            ))}
          {/* No conductor line here on purpose: the visit's public view does
              not carry one, and an empty «Ведущий» would read as "nobody is
              leading it", which is not what the schedule says. */}
          <Text style={styles.visitHint}>
            {t('fieldService.fromCoVisitHint')}
          </Text>
        </View>
      ) : null}

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
  onDuplicate,
  prefill,
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
  /** Called from the edit form to duplicate this meeting (page provides it). */
  onDuplicate?: () => void;
  /** Prefill for a brand-new meeting (used by "duplicate"). */
  prefill?: {
    startTime?: string;
    address?: string;
    topic?: string;
    sourceUrl?: string;
    isGeneral?: boolean;
    conductorPublisherId?: string | null;
    serviceGroupId?: string | null;
  };
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

  const groupsQuery = useQuery({
    queryKey: ['service-groups'],
    queryFn: () => serviceGroupsApi.list({}),
  });
  const groups = groupsQuery.data?.data ?? [];

  const hallsQuery = useQuery({
    queryKey: ['halls'],
    queryFn: () => hallsApi.list(),
    enabled: visible,
  });
  const halls = hallsQuery.data ?? [];

  // Who actually holds the appointments — the app already knows, and guessing
  // would be worse than asking.
  const respQuery = useQuery({
    queryKey: ['responsibilities'],
    queryFn: () => responsibilitiesApi.list(),
    enabled: visible,
  });
  const holderOf = (type: string): string | null => {
    const r = (respQuery.data ?? []).find((x) => x.type === type);
    if (!r) return null;
    const pub = (formPublishersQuery.data?.data ?? []).find(
      (p) => p.userId === r.userId,
    );
    return pub?.id ?? null;
  };

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
  const [serviceGroupId, setServiceGroupId] = useState<string | null>(null);
  const [overseerVisit, setOverseerVisit] = useState(false);
  const [overseerId, setOverseerId] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [notifyConductor, setNotifyConductor] = useState(true);
  const [pickedDate, setPickedDate] = useState<string>('');

  useEffect(() => {
    if (target === 'new') {
      setDayOfWeek(2);
      setStartTime(prefill?.startTime ?? '10:30');
      setAddress(prefill?.address ?? '');
      setConductorPublisherId(prefill?.conductorPublisherId ?? null);
      setTopic(prefill?.topic ?? '');
      setSourceUrl(prefill?.sourceUrl ?? '');
      setIsGeneral(prefill?.isGeneral ?? false);
      setServiceGroupId(prefill?.serviceGroupId ?? null);
      setOverseerVisit(false);
      setOverseerId(null);
      setAssistantId(null);
      setNotifyConductor(true);
      setPickedDate(defaultDate ?? '');
    } else if (target) {
      setDayOfWeek(target.dayOfWeek);
      setStartTime(target.startTime);
      setAddress(target.address);
      setConductorPublisherId(target.conductorPublisherId);
      setTopic(target.topic ?? '');
      setSourceUrl(target.sourceUrl ?? '');
      setIsGeneral(target.isGeneral);
      setServiceGroupId(target.serviceGroupId ?? null);
      setOverseerVisit(target.serviceOverseerVisit ?? false);
      setOverseerId(target.serviceOverseerPublisherId ?? null);
      setAssistantId(target.serviceOverseerAssistantId ?? null);
      setNotifyConductor(true);
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

  // Explain a disabled Save button: list exactly what is still missing.
  const saveHints: string[] = [];
  if (pickDate && !editing && !pickedDate)
    saveHints.push(t('fieldService.form.hintDate'));
  if (!TIME_RE.test(startTime)) saveHints.push(t('fieldService.form.hintTime'));
  if (address.trim().length === 0)
    saveHints.push(t('fieldService.form.hintAddress'));

  // ---- Rotation / topic hints (advisory) ----
  /** «11 июля» — a date a person reads, not one they decode. The year is
   * left off: everything here is within a few months either way. */
  const fmtDayMonth = (iso: string) =>
    dayjs(iso).locale(i18n.language).format('D MMMM');

  const fmtDate = (iso: string) => iso.split('-').reverse().join('.');
  const effectiveWeek = editing
    ? editing.weekStartDate
    : pickDate && pickedDate
      ? mondayOf(pickedDate)
      : weekStartISO;
  // Exact calendar date of the meeting (week Monday + selected weekday).
  const meetingDateISO =
    pickDate && !editing && pickedDate
      ? pickedDate
      : formatDateISO(addDays(parseISODate(effectiveWeek), dayOfWeek - 1));
  // Special events (congress, CO visit, ...) overlapping the meeting date.
  const eventsQuery = useQuery({
    queryKey: ['special-events'],
    queryFn: () => specialEventsApi.list(),
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });
  const clashingEvents = (eventsQuery.data ?? []).filter(
    (e) => e.date <= meetingDateISO && meetingDateISO <= (e.endDate ?? e.date),
  );
  // Candidates + absences: power the "suggest" button and picker ordering.
  const formPublishersQuery = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({ limit: 200 }),
    enabled: visible,
    staleTime: 60 * 1000,
  });
  const formAbsencesQuery = useQuery({
    queryKey: ['absences', 'week-warn'],
    queryFn: () => absencesApi.list(),
    enabled: visible,
    staleTime: 60 * 1000,
  });
  const isAbsentOnDate = (publisherId: string) =>
    (formAbsencesQuery.data ?? []).some(
      (a) =>
        a.publisherId === publisherId &&
        a.startDate <= meetingDateISO &&
        meetingDateISO <= (a.endDate ?? a.startDate),
    );
  // Rank: free brothers first — never led on the very top, then the
  // longest-not-led. Anyone with an UPCOMING meeting already on the books
  // sinks to the bottom (they are taken), soonest upcoming last but ordered
  // among themselves by that date.
  const UPCOMING = 1e14; // larger than any Date.parse() ms value
  const conductorRank = (publisherId: string) => {
    const st = conductorStatsQuery.data?.find(
      (c) => c.conductorPublisherId === publisherId,
    );
    if (st?.nextDate) return UPCOMING + Date.parse(st.nextDate);
    if (!st || st.total === 0 || !st.lastDate) return 0;
    return Date.parse(st.lastDate);
  };
  const suggestConductor = () => {
    const busy = weekConductorIds
      ? weekConductorIds(effectiveWeek, editing?.id)
      : [];
    const candidates = (formPublishersQuery.data?.data ?? []).filter(
      (p) =>
        p.isActive !== false &&
        p.gender === 'brother' &&
        p.capabilities?.fs_meeting_conductor === true &&
        p.id !== conductorPublisherId &&
        !busy.includes(p.id) &&
        !isAbsentOnDate(p.id),
    );
    if (candidates.length === 0) return;
    candidates.sort(
      (a, b) =>
        conductorRank(a.id) - conductorRank(b.id) ||
        a.displayName.localeCompare(b.displayName),
    );
    setConductorPublisherId(candidates[0].id);
  };
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
      // A meeting is either everyone's or one group's — the database refuses
      // both at once, so the form must not send both either.
      serviceGroupId: isGeneral ? null : serviceGroupId,
      serviceOverseerVisit: !isGeneral && !!serviceGroupId && overseerVisit,
      serviceOverseerPublisherId: overseerVisit ? overseerId : null,
      serviceOverseerAssistantId: overseerVisit ? assistantId : null,
      notifyConductor,
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
                  compact
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

            {clashingEvents.length > 0 && (
              <View style={styles.eventWarnBox}>
                <Ionicons name="warning-outline" size={16} color="#b45309" />
                <Text style={styles.eventWarnText}>
                  {clashingEvents
                    .map((e) =>
                      t('fieldService.form.eventWarn', { title: e.title }),
                    )
                    .join('\n')}
                </Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>{t('fieldService.timeLabel')}</Text>
            <TimeField value={startTime} onChange={setStartTime} />

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

            {/* Hidden during a visit: the choice above already says who
                conducts, and offering the whole congregation as well would
                only invite an answer that contradicts it. */}
            {!overseerVisit ? (
              <>
            <PublisherSelector
              label={t('fieldService.conductor')}
              value={conductorPublisherId}
              onChange={setConductorPublisherId}
              requiredCapability="fs_meeting_conductor"
              currentWeekStart={effectiveWeek}
              // The field-service meeting has its own day — often a Saturday —
              // and the congregation's settings only know the midweek and
              // weekend ones. Without this, a brother away exactly on that
              // Saturday was shown as free.
              absenceDate={meetingDateISO}
              sortRank={conductorRank}
              rowTone={(id) => {
                const st = conductorStatsQuery.data?.find(
                  (c) => c.conductorPublisherId === id,
                );
                if (st?.nextDate) return 'busy';
                if (!st || st.total === 0) return 'free';
                return undefined;
              }}
              rowMeta={(id) => {
                const st = conductorStatsQuery.data?.find(
                  (c) => c.conductorPublisherId === id,
                );
                // Said in words and in the order the answer is needed.
                //
                // It used to read «всего: 1 · последний: 30.05.2026» — three
                // service words, dotted numerals, and no difference in weight
                // between «has never led» and «led long ago», which is the one
                // distinction this line exists to make.
                //
                // ALREADY TAKEN COMES FIRST when it applies: that is the
                // reason NOT to choose this brother, and a reason to stop
                // reading belongs at the start of the line, not the end.
                const bits: string[] = [];
                if (st?.nextDate) {
                  bits.push(
                    t('fieldService.stat.next', {
                      date: fmtDayMonth(st.nextDate),
                    }),
                  );
                }
                if (!st || st.total === 0) {
                  bits.push(t('fieldService.stat.never'));
                } else {
                  // Without a last date the sentence must not end in mid-air:
                  // «Вёл 1 · последний » is what an empty slot looks like, and
                  // it happens to everyone who has only a future booking.
                  bits.push(
                    st.lastDate
                      ? t('fieldService.stat.led', {
                          count: st.total,
                          date: fmtDayMonth(st.lastDate),
                        })
                      : t('fieldService.stat.ledOnly', { count: st.total }),
                  );
                }
                return bits.join(' · ');
              }}
            />
            <Pressable
              onPress={suggestConductor}
              hitSlop={6}
              style={styles.suggestBtn}
            >
              <Ionicons name="sparkles-outline" size={14} color="#0369a1" />
              <Text style={styles.suggestBtnText}>
                {t('fieldService.form.suggest')}
              </Text>
            </Pressable>
            {conductorPublisherId ? (
              <>
                <Text style={styles.statHint}>
                  {/* The same words as in the list above: one fact must not
                      be phrased two ways on one screen. */}
                  {selectedStat
                    ? [
                        selectedStat.nextDate
                          ? t('fieldService.stat.next', {
                              date: fmtDayMonth(selectedStat.nextDate),
                            })
                          : null,
                        selectedStat.total > 0
                          ? selectedStat.lastDate
                            ? t('fieldService.stat.led', {
                                count: selectedStat.total,
                                date: fmtDayMonth(selectedStat.lastDate),
                              })
                            : t('fieldService.stat.ledOnly', {
                                count: selectedStat.total,
                              })
                          : t('fieldService.stat.never'),
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

            {/* The group comes FIRST and «общая» after it: a group meeting is
                the usual case here, so the ordinary path should read as the
                default and the exception as the exception. */}
            {!isGeneral ? (
              <>
                <Text style={styles.fieldLabel}>
                  {t('fieldService.groupLabel')}
                </Text>
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => setServiceGroupId(null)}
                    style={[
                      styles.chip,
                      serviceGroupId === null && styles.chipOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        serviceGroupId === null && styles.chipTextOn,
                      ]}
                    >
                      {t('fieldService.groupNone')}
                    </Text>
                  </Pressable>
                  {groups.map((g: { id: string; name: string }) => (
                    <Pressable
                      key={g.id}
                      onPress={() => setServiceGroupId(g.id)}
                      style={[
                        styles.chip,
                        serviceGroupId === g.id && styles.chipOn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          serviceGroupId === g.id && styles.chipTextOn,
                        ]}
                      >
                        {g.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            {/* The visit is offered only where it can mean something: it is a
                visit TO A GROUP, and the database refuses one without a group.
                Showing the switch anyway would let a person set it and lose
                the setting on save with no explanation. */}
            {!isGeneral && serviceGroupId ? (
              <>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>
                      {t('fieldService.overseerVisit')}
                    </Text>
                    <Text style={styles.toggleHint}>
                      {t('fieldService.overseerVisitHint')}
                    </Text>
                  </View>
                  <Switch
                    value={overseerVisit}
                    onValueChange={(on) => {
                      setOverseerVisit(on);
                      // The overseer is ONE appointed brother, so filling him
                      // in is not a guess — it is the only answer there is.
                      // The assistant is not filled in: he does not always
                      // come, and a name put there by the form would be read
                      // later as a record that he did.
                      if (on) {
                        const holder = overseerId ?? holderOf('service_overseer');
                        if (!overseerId) setOverseerId(holder);
                        // And he CONDUCTS unless told otherwise. Leaving this
                        // empty made the meeting read «не назначен» in every
                        // list, which is exactly what a visit is not: the
                        // choice below changes who, it does not decide whether
                        // anybody was chosen at all.
                        if (!conductorPublisherId && holder) {
                          setConductorPublisherId(holder);
                        }
                      }
                    }}
                    trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }}
                  />
                </View>
                {overseerVisit ? (
                  <>
                    <Text style={styles.fieldLabel}>
                      {t('fieldService.overseer')}
                    </Text>
                    <PublisherSelector
                      boxed
                      // He is coming to THIS meeting, so the same day decides
                      // whether he is away — the conductor picker below had
                      // this and these two did not.
                      absenceDate={meetingDateISO}
                      label={t('fieldService.overseer')}
                      value={overseerId}
                      onChange={(id) => {
                        // The conductor follows him, unless the assistant was
                        // deliberately put there: a name left behind after the
                        // overseer changed would be a quiet mistake.
                        if (
                          conductorPublisherId === overseerId ||
                          !conductorPublisherId
                        ) {
                          setConductorPublisherId(id);
                        }
                        setOverseerId(id);
                      }}
                    />
                    <View style={styles.assistantHead}>
                      <Text style={styles.fieldLabel}>
                        {t('fieldService.overseerAssistant')}
                      </Text>
                      {/* One tap rather than a name put there by the form:
                          he does not always come, and a prefilled name would
                          later read as a record that he did. */}
                      {!assistantId && holderOf('service_overseer_assistant') ? (
                        <Pressable
                          hitSlop={6}
                          onPress={() =>
                            setAssistantId(holderOf('service_overseer_assistant'))
                          }
                        >
                          <Text style={styles.fillIn}>
                            {t('fieldService.fillAssistant')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <PublisherSelector
                      boxed
                      absenceDate={meetingDateISO}
                      label={t('fieldService.overseerAssistant')}
                      value={assistantId}
                      onChange={setAssistantId}
                    />

                    {/* Who conducts, instead of the ordinary conductor field.
                        With a visit it is one of these two and nobody else,
                        so a full picker would only invite a wrong answer —
                        but the CONDUCTOR still has to be recorded, or the
                        meeting shows as unassigned everywhere else: in the
                        printed schedule, in his own assignments, in the
                        rotation that says who has not led lately. */}
                    <Text style={styles.fieldLabel}>
                      {t('fieldService.whoConducts')}
                    </Text>
                    <View style={styles.chipRow}>
                      <Pressable
                        onPress={() => setConductorPublisherId(overseerId)}
                        style={[
                          styles.chip,
                          conductorPublisherId === overseerId &&
                            overseerId != null &&
                            styles.chipOn,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            conductorPublisherId === overseerId &&
                              overseerId != null &&
                              styles.chipTextOn,
                          ]}
                        >
                          {t('fieldService.overseer')}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={!assistantId}
                        onPress={() => setConductorPublisherId(assistantId)}
                        style={[
                          styles.chip,
                          !assistantId && styles.chipOff,
                          conductorPublisherId === assistantId &&
                            assistantId != null &&
                            styles.chipOn,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            conductorPublisherId === assistantId &&
                              assistantId != null &&
                              styles.chipTextOn,
                          ]}
                        >
                          {t('fieldService.overseerAssistant')}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </>
            ) : null}

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

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>
                  {t('fieldService.form.notifyConductor')}
                </Text>
                <Text style={styles.toggleHint}>
                  {t('fieldService.form.notifyConductorHint')}
                </Text>
              </View>
              <Switch
                value={notifyConductor}
                onValueChange={setNotifyConductor}
                trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }}
              />
            </View>

            {!!editing && !!onDuplicate && (
              <Pressable style={styles.duplicateLink} onPress={onDuplicate}>
                <Ionicons name="copy-outline" size={15} color="#0369a1" />
                <Text style={styles.duplicateLinkText}>
                  {t('fieldService.duplicate')}
                </Text>
              </Pressable>
            )}
          </ScrollView>

          {!canSave && saveHints.length > 0 && (
            <Text style={styles.saveHint}>{saveHints.join(' · ')}</Text>
          )}
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
  assistantHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fillIn: {
    fontSize: 12.5,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  chipOff: { opacity: 0.45 },
  visitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#cffafe',
  },
  visitBadgeText: {
    fontSize: 11.5,
    color: '#0e7490',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  chipOn: { backgroundColor: '#0e7490' },
  chipText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  chipTextOn: { color: '#ffffff' },
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
  hallChipText: { fontSize: 13, color: '#475569', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
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
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
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

  visitBlock: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f0fdff',
    borderWidth: 1,
    borderColor: '#cff2f7',
    gap: 8,
  },
  visitHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  visitHeadText: {
    fontSize: 12,
    color: '#0e7490',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  visitRow: { gap: 2 },
  visitHint: { fontSize: 12, color: '#64748b', fontStyle: 'italic' },
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
  when: { fontSize: 14, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
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
  generalBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#7c3aed' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  toggleHint: { fontSize: 12, color: '#64748b', marginTop: 2 },
  rowMineGlow: { borderRadius: 12, marginVertical: 2 },
  address: { fontSize: 13, color: '#475569' },
  topic: { fontSize: 13, color: '#64748b', fontStyle: 'italic' },
  link: { fontSize: 13, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold', marginTop: 2 },
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
  addBtnText: { fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0369a1' },

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
  modalTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  formScroll: { maxHeight: 420 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#475569',
    marginTop: 10,
    marginBottom: 4,
  },
  statHint: {
    fontSize: 12,
    color: '#0369a1',
    marginTop: 6,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
  },
  warnHint: {
    fontSize: 12,
    color: '#b45309',
    marginTop: 4,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
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
  dayChipText: { fontSize: 13, color: '#475569', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
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
  multiline: { minHeight: 40, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  duplicateLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  duplicateLinkText: { color: '#0369a1', fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  suggestBtnText: { color: '#0369a1', fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  saveHint: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    textAlign: 'right',
    marginBottom: 6,
  },
  eventWarnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  eventWarnText: {
    flex: 1,
    color: '#92400e',
    fontSize: 13,
    lineHeight: 18,
  },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  modalConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
  },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  disabled: { opacity: 0.5 },
});
