import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ConductorCandidate,
  CreateFieldServiceMeetingInput,
  FieldServiceMeeting,
  UpdateFieldServiceMeetingInput,
  fieldServiceApi,
  fieldServiceStatsApi,
  hallsApi,
  isFieldServiceCancelled,
  isFieldServiceDraft,
  responsibilitiesApi,
  serviceGroupsApi,
} from '../lib/api';
import { resolveHallAddress } from '../lib/hallAddress';
import { Sheet } from './Sheet';
import { PublisherSelector } from './PublisherSelector';
import { TimeField } from './TimeField';
import { FieldCancelled, FieldNotice } from './FieldNotice';
import { confirm } from './ConfirmHost';
import { hallBusyLine, hallBusyNoticeSeed } from '../lib/hall-busy';
import { MonthCalendar } from './MonthCalendar';
import {
  startOfWeekMonday,
  formatDateISO,
  parseISODate,
  addDays,
} from '../lib/dates';
import { useAllPublishers } from '../lib/useAllPublishers';
import { notify } from '../lib/error-bus';

/**
 * The window of one field-service meeting (October 2026, stage 3a).
 *
 * Built again from the overseer's questions, in his order: WHOSE meeting
 * (everybody's, or a group's), WHEN, WHERE, WHO CONDUCTS — and only then
 * the theme and the material, folded away. The old window asked the same
 * things in the order the database stores them, with the group and
 * «общая» at the very bottom, and the list «who conducts» was the whole
 * roster with a sorting rule hidden in the app. Now the candidates come
 * from the server with their reasons — «не вёл с июня», «в этот день уже
 * ведёт», «отсутствует» — counted from the DAY of the meeting, and one
 * rule serves this window and the month's preparation alike.
 *
 * Three kinds of meeting: a group's own, the one for the whole congregation
 * («Общая»), and «по группам» — the day every group goes out on its own,
 * written as one line with no group and not general. The last one is what
 * the live schedule mostly holds (Lionel, 10 October 2026), so it stays a
 * choice of its own rather than being folded into «общая».
 *
 * One window for two screens: the month page picks a date, the week's
 * programme editor picks a weekday of its week. A meeting already held is
 * a record — shown, not edited.
 */

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

/**
 * «Delete?» — said the way the meeting stands (13 October 2026). A draft
 * goes quietly; an announced one is called off for everyone, and the
 * planner is pointed to «Отменить», which keeps it in sight; a cancelled one
 * only leaves the schedule. Both screens that delete ask through this, so
 * the programme editor no longer deletes at a single tap.
 */
export async function confirmFieldServiceDelete(
  m: FieldServiceMeeting | null | undefined,
  t: (key: string) => string,
): Promise<boolean> {
  const body = !m
    ? t('fieldService.deleteConfirm')
    : isFieldServiceDraft(m)
      ? t('fieldService.deleteConfirmDraft')
      : isFieldServiceCancelled(m)
        ? t('fieldService.deleteConfirmCancelled')
        : t('fieldService.deleteConfirmPublished');
  return confirm({
    title: t('fieldService.delete'),
    body,
    confirmLabel: t('fieldService.delete'),
    danger: true,
  });
}

export type FieldServiceFormProps = {
  target: FieldServiceMeeting | 'new' | null;
  weekStartISO: string;
  onClose: () => void;
  onCreate: (input: CreateFieldServiceMeetingInput) => void;
  onUpdate: (id: string, input: UpdateFieldServiceMeetingInput) => void;
  /** Delete, offered inside the window of a meeting not yet held. */
  onRemove?: (id: string) => void;
  /** When true (the month page), pick a full date instead of a weekday. */
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
    /**
     * Open as the service overseer's visit to that group, with the overseer
     * filled in — the «Запланировать посещение» door on his page.
     */
    serviceOverseerVisit?: boolean;
  };
  /** Default date (ISO) to preselect in date-pick mode. */
  defaultDate?: string;
  /**
   * A new meeting goes into a month still being prepared: saved as a draft,
   * told to nobody until the month is published.
   */
  asDraft?: boolean;
};

export function FieldServiceForm({
  target,
  weekStartISO,
  onClose,
  onCreate,
  onUpdate,
  onRemove,
  pickDate = false,
  onDuplicate,
  prefill,
  defaultDate,
  asDraft = false,
}: FieldServiceFormProps) {
  const { t, i18n } = useTranslation();
  const editing = target && target !== 'new' ? target : null;
  const visible = target !== null;

  const groupsQuery = useQuery({
    queryKey: ['service-groups'],
    queryFn: () => serviceGroupsApi.list({}),
    enabled: visible,
  });
  const groups = groupsQuery.data?.data ?? [];
  const hallsQuery = useQuery({
    queryKey: ['halls'],
    queryFn: () => hallsApi.list(),
    enabled: visible,
  });
  const halls = hallsQuery.data ?? [];
  const respQuery = useQuery({
    queryKey: ['responsibilities'],
    queryFn: () => responsibilitiesApi.list(),
    enabled: visible,
  });
  const publishersQuery = useAllPublishers({ enabled: visible });
  const publishers = publishersQuery.data?.data ?? [];
  const nameOf = (id: string | null) =>
    id ? (publishers.find((p) => p.id === id)?.displayName ?? '') : '';
  const holderOf = (type: string): string | null => {
    const r = (respQuery.data ?? []).find((x) => x.type === type);
    if (!r) return null;
    return publishers.find((p) => p.userId === r.userId)?.id ?? null;
  };
  const topicHistoryQuery = useQuery({
    queryKey: ['field-service-topic-history'],
    queryFn: () => fieldServiceStatsApi.topicHistory(),
    enabled: visible,
  });

  // ---- state -------------------------------------------------------------
  const [dayOfWeek, setDayOfWeek] = useState<number>(6);
  const [pickedDate, setPickedDate] = useState<string>('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [address, setAddress] = useState('');
  const [addressOpen, setAddressOpen] = useState(false);
  const [conductorPublisherId, setConductorPublisherId] = useState<
    string | null
  >(null);
  const [topic, setTopic] = useState('');
  const [notice, setNotice] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [materialOpen, setMaterialOpen] = useState(false);
  const [serviceGroupId, setServiceGroupId] = useState<string | null>(null);
  const [general, setGeneral] = useState(false);
  const [overseerVisit, setOverseerVisit] = useState(false);
  const [overseerId, setOverseerId] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [notifyConductor, setNotifyConductor] = useState(true);
  // The week a meeting being edited stands in — it may move to another one
  // (13 October 2026). Empty for a new meeting.
  const [editWeek, setEditWeek] = useState('');
  // Tell the group or congregation when the day, hour or place moves, or
  // the meeting is called off. On unless the planner says otherwise.
  const [notifyAudience, setNotifyAudience] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  // «Choose the group first» was tapped under the visit card: «Чья» lights
  // up for a moment, and the sheet scrolls back to it.
  const [whoseNudge, setWhoseNudge] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  // A visit asked for by the caller still waits for its overseer: the
  // responsibilities and the roster arrive after the window has opened.
  const fillOverseer = useRef(false);

  const todayISO = formatDateISO(new Date());
  // An iPad or wider: the window floats in the middle at a readable width,
  // instead of stretching chips and days across the whole screen (16 October 2026).
  const wideSheet = useWindowDimensions().width >= 900;

  useEffect(() => {
    if (target === 'new') {
      setDayOfWeek(6);
      setPickedDate(defaultDate ?? '');
      setCalendarOpen(false);
      setStartTime(prefill?.startTime ?? '10:30');
      // Where, from the start: the group's own place, else the main hall.
      // Set HERE, not in the effect below — that one read the address the
      // last window had left behind and stayed silent, and a new meeting
      // opened with «Укажите адрес» and no hall chosen (phone, 11 October).
      const hallDefault = (halls.find((h) => h.isDefault) ?? halls[0])?.address ?? '';
      const groupDefault = prefill?.serviceGroupId
        ? (groups.find((g) => g.id === prefill.serviceGroupId)?.meetingLocation?.trim() ?? '')
        : '';
      setAddress(prefill?.address ?? (groupDefault || hallDefault));
      setAddressOpen(false);
      setConductorPublisherId(prefill?.conductorPublisherId ?? null);
      setTopic(prefill?.topic ?? '');
      // Never copied from a prefill: a notice is about one Saturday.
      setNotice('');
      setSourceUrl(prefill?.sourceUrl ?? '');
      setMaterialOpen(!!(prefill?.topic || prefill?.sourceUrl));
      setServiceGroupId(prefill?.serviceGroupId ?? null);
      // The congregation's own meeting is the usual one (Lionel, 10 October):
      // a new entry starts as that unless the caller says whose it is.
      setGeneral(!prefill?.serviceGroupId && (prefill?.isGeneral ?? true));
      const visit = !!prefill?.serviceGroupId && !!prefill?.serviceOverseerVisit;
      setOverseerVisit(visit);
      setOverseerId(null);
      setAssistantId(null);
      fillOverseer.current = visit;
      setNotifyConductor(true);
      setEditWeek('');
      setNotifyAudience(true);
      setCancelOpen(false);
      setCancelReason('');
      setWhoseNudge(false);
    } else if (target) {
      setDayOfWeek(target.dayOfWeek);
      setPickedDate('');
      setCalendarOpen(false);
      setStartTime(target.startTime);
      setAddress(target.address);
      setAddressOpen(false);
      setConductorPublisherId(target.conductorPublisherId);
      setTopic(target.topic ?? '');
      setNotice(target.notice ?? '');
      setSourceUrl(target.sourceUrl ?? '');
      setMaterialOpen(!!(target.topic || target.sourceUrl));
      setServiceGroupId(target.serviceGroupId ?? null);
      setGeneral(!target.serviceGroupId && target.isGeneral);
      setOverseerVisit(target.serviceOverseerVisit ?? false);
      setOverseerId(target.serviceOverseerPublisherId ?? null);
      setAssistantId(target.serviceOverseerAssistantId ?? null);
      fillOverseer.current = false;
      setNotifyConductor(true);
      setEditWeek(target.weekStartDate);
      setNotifyAudience(true);
      setCancelOpen(false);
      setCancelReason('');
      setWhoseNudge(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // The overseer for a visit the caller asked for, once the roster and the
  // responsibilities are here — the same fill the switch does by hand.
  useEffect(() => {
    if (!fillOverseer.current || target !== 'new') return;
    const holder = holderOf('service_overseer');
    if (!holder) return;
    fillOverseer.current = false;
    setOverseerId(holder);
    setConductorPublisherId((c) => c ?? holder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, respQuery.data, publishersQuery.data]);

  useEffect(() => {
    if (!whoseNudge) return;
    const h = setTimeout(() => setWhoseNudge(false), 2500);
    return () => clearTimeout(h);
  }, [whoseNudge]);

  // In the week editor the weekday opens on the first day still to come.
  useEffect(() => {
    if (target !== 'new' || pickDate || !weekStartISO) return;
    const monday = parseISODate(weekStartISO);
    const first = DAYS.find(
      (d) => formatDateISO(addDays(monday, d - 1)) >= todayISO,
    );
    setDayOfWeek(first ?? 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const group = serviceGroupId
    ? (groups.find((g) => g.id === serviceGroupId) ?? null)
    : null;
  const groupPlace = group?.meetingLocation?.trim() || '';
  const isGeneral = serviceGroupId === null && general;

  // Where, by default: the group's own place; everybody's — the main hall.
  // Once, and only while the field is still empty: a cleared field stays
  // cleared.
  useEffect(() => {
    if (target !== 'new' || address !== '') return;
    if (groupPlace) {
      setAddress(groupPlace);
      return;
    }
    if (halls.length > 0) {
      const def = halls.find((h) => h.isDefault) ?? halls[0];
      setAddress(def.address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, hallsQuery.data, groupPlace]);

  // ---- the day -----------------------------------------------------------
  const heldOn = (week: string, dow: number) =>
    formatDateISO(addDays(parseISODate(week), dow - 1));
  const recordDate = editing
    ? heldOn(editing.weekStartDate, editing.dayOfWeek)
    : null;
  const isRecord = !!recordDate && recordDate < todayISO;
  const editingWeek = editing ? editWeek || editing.weekStartDate : '';
  const meetingDate: string | null = editing
    ? heldOn(editingWeek, dayOfWeek)
    : pickDate
      ? pickedDate || null
      : weekStartISO
        ? heldOn(weekStartISO, dayOfWeek)
        : null;
  const chosenPast = !isRecord && !!meetingDate && meetingDate < todayISO;
  const effectiveWeek = editing
    ? editingWeek
    : pickDate && pickedDate
      ? mondayOf(pickedDate)
      : weekStartISO;

  const fmtDay = (iso: string) =>
    dayjs(iso).locale(i18n.language).format('dd D MMM');
  const fmtDayLong = (iso: string) =>
    dayjs(iso).locale(i18n.language).format('dd D MMMM');
  const fmtDayMonth = (iso: string) =>
    dayjs(iso).locale(i18n.language).format('D MMMM');
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // The nearest Saturdays, from the month the page stood on — or from today
  // when that month is the one being lived. Another day: the calendar.
  const quickDates = useMemo(() => {
    if (!pickDate || editing) return [] as string[];
    const from =
      defaultDate && defaultDate > todayISO ? defaultDate : todayISO;
    const start = parseISODate(from);
    const toSat = (6 - isoDow(from) + 7) % 7;
    return Array.from({ length: 4 }, (_, i) =>
      formatDateISO(addDays(start, toSat + i * 7)),
    );
  }, [pickDate, editing, defaultDate, todayISO]);
  const pickedIsQuick = !!pickedDate && quickDates.includes(pickedDate);

  // ---- who conducts ------------------------------------------------------
  const candidatesQuery = useQuery({
    queryKey: [
      'field-service',
      'suggest',
      meetingDate,
      serviceGroupId,
      editing?.id ?? null,
    ],
    queryFn: () =>
      fieldServiceApi.suggestConductor({
        date: meetingDate!,
        serviceGroupId,
        conductorRule: serviceGroupId ? 'group_overseer' : 'rotation',
        excludeMeetingId: editing?.id ?? null,
      }),
    enabled: visible && !!meetingDate && !isRecord && !overseerVisit,
    staleTime: 60 * 1000,
  });
  const candidates = candidatesQuery.data ?? [];
  const selected = conductorPublisherId
    ? (candidates.find((c) => c.publisherId === conductorPublisherId) ?? null)
    : null;
  // The chosen one first, then the first three others as the server ranked
  // them — free before busy — and a door to the whole roster below.
  const shortlist: ConductorCandidate[] = [
    ...(selected ? [selected] : []),
    ...candidates.filter((c) => c.publisherId !== conductorPublisherId).slice(0, 3),
  ];
  const reasonText = (c: ConductorCandidate) => {
    switch (c.reason) {
      case 'never_led':
        return t('fieldService.why.neverLed');
      case 'last_led':
        return c.lastDate
          ? t('fieldService.why.lastLed', { date: fmtDayMonth(c.lastDate) })
          : t('fieldService.why.neverLed');
      case 'upcoming':
        return c.lastDate
          ? t('fieldService.why.upcoming', { date: fmtDayMonth(c.lastDate) })
          : t('fieldService.why.neverLed');
      case 'group_overseer':
        return t('fieldService.why.groupOverseer');
      case 'group_assistant':
        return t('fieldService.why.groupAssistant');
      case 'leads_that_day':
        return t('fieldService.why.leadsThatDay');
      case 'absent':
        return t('fieldService.why.absent');
    }
  };

  // ---- the day's other meetings and events -------------------------------
  const sameWeekQuery = useQuery({
    queryKey: ['field-service', 'week', effectiveWeek, 'drafts', 'cancelled'],
    queryFn: () =>
      fieldServiceApi.list({
        weekStart: effectiveWeek,
        weekEnd: formatDateISO(addDays(parseISODate(effectiveWeek), 7)),
        drafts: true,
        // Called-off ones too: moving onto a day whose meeting was called off
        // is said (16 October 2026).
        cancelled: true,
      }),
    enabled: visible && !!effectiveWeek,
  });
  const onTheDay = (sameWeekQuery.data ?? []).filter(
    (m) =>
      m.weekStartDate === effectiveWeek &&
      m.dayOfWeek === dayOfWeek &&
      m.id !== editing?.id,
  );
  const sameDay = onTheDay.filter((m) => !m.cancelledAt);
  const sameDayCancelled = onTheDay.filter((m) => !!m.cancelledAt);
  // WHAT WOULD CLASH (16 October 2026) — the server's own rule
  // (field-service-meetings.service assertNoConflicts): the same meeting at
  // the same hour for the same people, or the conductor already conducting
  // that day. Said here before «Сохранить»; saving then confirms it.
  const audienceKey = (general: boolean, group: string | null) =>
    general ? 'general' : (group ?? 'groups');
  const conflictLines: string[] = [];
  for (const o of sameDay) {
    if (
      o.startTime === startTime &&
      audienceKey(o.isGeneral, o.serviceGroupId) === audienceKey(isGeneral, isGeneral ? null : serviceGroupId)
    ) {
      conflictLines.push(t('fieldService.conflict.duplicate', { time: o.startTime }));
    } else if (conductorPublisherId && o.conductorPublisherId === conductorPublisherId) {
      conflictLines.push(
        t('fieldService.conflict.conductorBusy', { name: nameOf(conductorPublisherId), time: o.startTime }),
      );
    }
  }
  const groupNameOf = (id: string | null) =>
    groups.find((g) => g.id === id)?.name ?? '';
  const sameDayNote = (() => {
    if (!isGeneral && !!serviceGroupId && overseerVisit) {
      const rest = sameDay.filter((m) => !m.serviceGroupId);
      if (rest.length === 0) return null;
      return t('fieldService.visitSameDay', {
        group: groupNameOf(serviceGroupId),
        times: rest.map((m) => m.startTime).join(', '),
      });
    }
    const v = sameDay.find((m) => m.serviceOverseerVisit && m.serviceGroupId);
    if (!v || (!!serviceGroupId && serviceGroupId !== v.serviceGroupId)) {
      return null;
    }
    return t('fieldService.sameDayAsVisit', {
      group: groupNameOf(v.serviceGroupId),
      time: v.startTime,
    });
  })();
  // What else is on that day — events and the pioneer school — asked of
  // the server, which the month preparation and the nightly message ask
  // too (13 October 2026). Before, the window read the events list itself
  // and knew nothing of the pioneer school.
  const busyQuery = useQuery({
    queryKey: ['field-service', 'hall-busy', meetingDate, meetingDate],
    queryFn: () => fieldServiceApi.hallBusy({ from: meetingDate!, to: meetingDate! }),
    enabled: visible && !!meetingDate && !isRecord,
    staleTime: 60 * 1000,
  });
  const dayBusy = busyQuery.data ?? [];
  // WHAT IS ON THE DAYS AHEAD, for the calendar's dots (16 October 2026):
  // asked only while a calendar is open — four months from today.
  const marksFrom = todayISO;
  const marksTo = dayjs(todayISO).add(4, 'month').format('YYYY-MM-DD');
  const marksMeetingsQuery = useQuery({
    queryKey: ['field-service', 'marks', marksFrom, marksTo],
    queryFn: () => fieldServiceApi.list({ weekStart: mondayOf(marksFrom), weekEnd: mondayOf(marksTo), drafts: true }),
    enabled: visible && calendarOpen,
    staleTime: 60 * 1000,
  });
  const marksBusyQuery = useQuery({
    queryKey: ['field-service', 'hall-busy', marksFrom, marksTo],
    queryFn: () => fieldServiceApi.hallBusy({ from: marksFrom, to: marksTo }),
    enabled: visible && calendarOpen,
    staleTime: 60 * 1000,
  });
  const calendarMarks: Record<string, 'meeting' | 'taken' | 'busy'> = {};
  for (const b of marksBusyQuery.data ?? []) {
    if (b.hard) calendarMarks[b.date] = 'taken';
    else if (!calendarMarks[b.date]) calendarMarks[b.date] = 'busy';
  }
  for (const m of marksMeetingsQuery.data ?? []) {
    if (m.id === editing?.id) continue;
    const d = heldOn(m.weekStartDate, m.dayOfWeek);
    if (!calendarMarks[d]) calendarMarks[d] = 'meeting';
  }
  const calendarLegend = (
    <View style={styles.legendRow}>
      {(
        [
          ['meeting', '#0ea5e9'],
          ['taken', '#dc2626'],
          ['busy', '#d97706'],
        ] as const
      ).map(([k, c]) => (
        <View key={k} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: c }]} />
          <Text style={styles.legendText}>{t(`fieldService.calendar.${k}`)}</Text>
        </View>
      ))}
    </View>
  );
  const softBusy = dayBusy.filter((b) => !b.hard);
  const topicMatch = (() => {
    const tt = topic.trim().toLowerCase();
    if (!tt) return null;
    const hit = topicHistoryQuery.data?.find(
      (e) => e.topic.trim().toLowerCase() === tt,
    );
    if (!hit) return null;
    if (recordDate && hit.lastDate === recordDate) return null;
    return hit;
  })();

  // ---- can it be saved ---------------------------------------------------
  const canSave =
    address.trim().length > 0 &&
    TIME_RE.test(startTime) &&
    !!meetingDate &&
    !isRecord &&
    !chosenPast;
  const saveHints: string[] = [];
  if (chosenPast) saveHints.push(t('fieldService.form.hintPastDay'));
  if (pickDate && !editing && !pickedDate)
    saveHints.push(t('fieldService.form.hintDate'));
  if (!TIME_RE.test(startTime)) saveHints.push(t('fieldService.form.hintTime'));
  if (address.trim().length === 0)
    saveHints.push(t('fieldService.form.hintAddress'));

  const draft = editing ? isFieldServiceDraft(editing) : asDraft;
  // The day, the hour or the place of an announced meeting is changing:
  // that is news for everyone going, not only for the conductor.
  const movedDay = !!editing && !!meetingDate && meetingDate !== recordDate;
  // INTO A MONTH NOT YET ANNOUNCED (16 October 2026): the meeting stays
  // announced — its people were told — while the rest of that month is still
  // a draft. Said, so the planner is not surprised to see it alone there.
  const targetMonth = meetingDate ? meetingDate.slice(0, 7) : null;
  const draftMonthQuery = useQuery({
    queryKey: ['field-service', 'month-drafts', targetMonth],
    queryFn: () =>
      fieldServiceApi.list({
        weekStart: mondayOf(`${targetMonth}-01`),
        weekEnd: formatDateISO(addDays(parseISODate(mondayOf(dayjs(`${targetMonth}-01`).add(1, 'month').format('YYYY-MM-DD'))), 7)),
        drafts: true,
      }),
    enabled:
      visible && movedDay && !!editing && !isFieldServiceDraft(editing) && !!targetMonth &&
      targetMonth !== recordDate?.slice(0, 7),
  });
  const intoDraftMonth =
    movedDay &&
    targetMonth &&
    targetMonth !== recordDate?.slice(0, 7) &&
    (draftMonthQuery.data ?? []).some(
      (m) => isFieldServiceDraft(m) && heldOn(m.weekStartDate, m.dayOfWeek).startsWith(targetMonth),
    )
      ? dayjs(`${targetMonth}-01`).locale(i18n.language).format('MMMM')
      : null;
  const changesForPeople =
    !!editing &&
    !draft &&
    (movedDay ||
      startTime !== editing.startTime ||
      address.trim() !== editing.address);
  const audienceName = (m: { serviceGroupId: string | null }) =>
    m.serviceGroupId
      ? t('fieldService.audience.group', { group: groupNameOf(m.serviceGroupId) })
      : t('fieldService.audience.everyone');

  const submit = () => {
    if (!canSave) return;
    const visit = !isGeneral && !!serviceGroupId && overseerVisit;
    const base = {
      dayOfWeek,
      startTime,
      address: address.trim(),
      conductorPublisherId,
      topic: topic.trim() || null,
      notice: notice.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
      // Two kinds only: a group's own, or everybody's.
      isGeneral,
      serviceGroupId,
      serviceOverseerVisit: visit,
      serviceOverseerPublisherId: visit ? overseerId : null,
      serviceOverseerAssistantId: visit ? assistantId : null,
      notifyConductor: draft ? false : notifyConductor,
      // The clash was shown above «Сохранить» — saving is the confirmation.
      ...(conflictLines.length ? { confirmConflicts: true } : {}),
    };
    if (editing) {
      onUpdate(editing.id, {
        ...base,
        // Only when it moved: an unchanged week is not sent at all.
        ...(editingWeek !== editing.weekStartDate ? { weekStartDate: editingWeek } : {}),
        ...(changesForPeople ? { notifyAudience } : {}),
      });
    } else if (pickDate && pickedDate) {
      onCreate({
        ...base,
        weekStartDate: mondayOf(pickedDate),
        dayOfWeek: isoDow(pickedDate),
        draft: asDraft || undefined,
      });
    } else {
      onCreate({
        weekStartDate: weekStartISO,
        ...base,
        draft: asDraft || undefined,
      });
    }
  };

  // ---- calling it off, bringing it back ------------------------------------
  // Here rather than in the two screens that open this window: both need
  // exactly the same, and the window is where the planner decides it.
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['field-service'] });
    qc.invalidateQueries({ queryKey: ['field-service-topic-history'] });
    qc.invalidateQueries({ queryKey: ['field-service-conductor-stats'] });
    qc.invalidateQueries({ queryKey: ['service-overseer'] });
  };
  const cancelM = useMutation({
    mutationFn: (id: string) =>
      fieldServiceApi.cancel(id, {
        reason: cancelReason.trim() || null,
        notifyAudience,
      }),
    onSuccess: () => {
      refresh();
      notify(t('fieldService.cancel.done'), undefined, 'success');
      onClose();
    },
  });
  const restoreM = useMutation({
    mutationFn: (id: string) => fieldServiceApi.restore(id, {}),
    onSuccess: () => {
      refresh();
      notify(t('fieldService.restore.done'), undefined, 'success');
      onClose();
    },
  });
  const askRestore = async (m: FieldServiceMeeting) => {
    if (
      await confirm({
        title: t('fieldService.restore.confirmTitle'),
        body: t('fieldService.restore.confirmBody'),
        confirmLabel: t('fieldService.restore.button'),
      })
    ) {
      restoreM.mutate(m.id);
    }
  };

  // ---- header ------------------------------------------------------------
  const whose = editing
    ? editing.serviceGroupId
      ? editing.serviceOverseerVisit
        ? t('fieldService.sheet.groupVisit', {
            group: groupNameOf(editing.serviceGroupId),
          })
        : t('fieldService.sheet.group', {
            group: groupNameOf(editing.serviceGroupId),
          })
      : editing.isGeneral
        ? t('fieldService.generalBadge')
        : t('fieldService.row.byGroups')
    : null;
  const title = editing
    ? `${cap(fmtDayLong(meetingDate ?? recordDate!))} · ${editing.startTime}`
    : t('fieldService.form.addTitle');
  const subtitle = editing
    ? [whose, draft ? t('fieldService.draft.badge') : null]
        .filter(Boolean)
        .join(' · ')
    : asDraft
      ? t('fieldService.draft.badge')
      : undefined;

  // ---- a meeting already held: a record ----------------------------------
  if (editing && isRecord) {
    return (
      <Sheet
        visible={visible}
        variant={wideSheet ? "centered" : "bottom"}
        title={title}
        subtitle={whose ?? undefined}
        onClose={onClose}
        closeLabel={t('common.close')}
      >
        <View style={styles.recordNote}>
          <Ionicons name="lock-closed-outline" size={16} color="#64748b" />
          <Text style={styles.recordNoteText}>
            {t('fieldService.sheet.recordNote')}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <SummaryRow
            label={t('fieldService.sheet.where')}
            value={resolveHallAddress(editing.address, halls)}
          />
          <SummaryRow
            label={t('fieldService.sheet.led')}
            value={
              nameOf(editing.conductorPublisherId) ||
              t('fieldService.unassigned')
            }
            strong
          />
          {editing.serviceOverseerVisit ? (
            <SummaryRow
              label={t('fieldService.overseerAssistant')}
              value={nameOf(editing.serviceOverseerAssistantId) || '—'}
            />
          ) : null}
          <SummaryRow
            label={t('fieldService.topicLabel')}
            value={editing.topic || t('fieldService.sheet.noTopic')}
            last
          />
        </View>
        {isFieldServiceCancelled(editing) ? (
          <FieldCancelled reason={editing.cancelReason} />
        ) : (
          <FieldNotice text={editing.notice} />
        )}
        {onDuplicate ? (
          <Pressable style={styles.secondaryBtn} onPress={onDuplicate}>
            <Text style={styles.secondaryBtnText}>
              {t('fieldService.sheet.sameOnAnotherDate')}
            </Text>
          </Pressable>
        ) : null}
      </Sheet>
    );
  }

  // ---- a meeting called off: crossed out, to bring back or delete -------
  if (editing && isFieldServiceCancelled(editing)) {
    return (
      <Sheet
        visible={visible}
        variant={wideSheet ? "centered" : "bottom"}
        title={title}
        subtitle={whose ?? undefined}
        onClose={onClose}
        closeLabel={t('common.close')}
      >
        <FieldCancelled reason={editing.cancelReason} big />
        <Text style={styles.cancelledNote}>{t('fieldService.sheetCancelled.note')}</Text>
        <View style={styles.summaryCard}>
          <SummaryRow
            label={t('fieldService.sheet.where')}
            value={resolveHallAddress(editing.address, halls)}
          />
          <SummaryRow
            label={t('fieldService.sheetCancelled.leads')}
            value={nameOf(editing.conductorPublisherId) || t('fieldService.unassigned')}
            strong
          />
          <SummaryRow
            label={t('fieldService.topicLabel')}
            value={editing.topic || t('fieldService.sheet.noTopic')}
            last
          />
        </View>
        <Pressable
          style={[styles.primaryBtn, restoreM.isPending && styles.saveBtnOff]}
          disabled={restoreM.isPending}
          onPress={() => void askRestore(editing)}
        >
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>{t('fieldService.restore.button')}</Text>
        </Pressable>
        {onRemove ? (
          <Pressable
            style={[styles.secondaryBtn, styles.dangerBtn]}
            onPress={() => onRemove(editing.id)}
          >
            <Text style={[styles.secondaryBtnText, styles.dangerBtnText]}>
              {t('fieldService.delete')}
            </Text>
          </Pressable>
        ) : null}
      </Sheet>
    );
  }

  // ---- the form ----------------------------------------------------------
  const weekDays = effectiveWeek
    ? DAYS.map((d) => ({
        d,
        iso: formatDateISO(addDays(parseISODate(effectiveWeek), d - 1)),
      }))
    : [];

  return (
    <Sheet
      visible={visible}
      variant={wideSheet ? "centered" : "bottom"}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      closeLabel={t('common.close')}
      hideClose
      scrollRef={scrollRef}
      footer={
        <View style={styles.footer}>
          {!canSave && saveHints.length > 0 ? (
            <Text style={styles.saveHint}>{saveHints.join(' · ')}</Text>
          ) : null}
          <View style={styles.footerRow}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, conflictLines.length > 0 && styles.saveBtnAnyway, !canSave && styles.saveBtnOff]}
              onPress={submit}
              disabled={!canSave}
            >
              <Text style={styles.saveBtnText}>
                {conflictLines.length > 0 ? t('fieldService.conflict.saveAnyway') : t('fieldService.form.save')}
              </Text>
            </Pressable>
          </View>
        </View>
      }
    >
      {/* Whose */}
      <Text style={[styles.label, whoseNudge && styles.labelNudge]}>
        {t('fieldService.sheet.whose')}
      </Text>
      <View style={[styles.segmentTrack, whoseNudge && styles.segmentTrackNudge]}>
        {[
          { key: 'general', id: null as string | null, general: true, name: t('fieldService.sheet.general') },
          { key: 'open', id: null as string | null, general: false, name: t('fieldService.sheet.byGroups') },
          ...groups.map((g) => ({ key: g.id, id: g.id as string | null, general: false, name: g.name })),
        ].map(
          (g) => {
            const on = serviceGroupId === g.id && (g.id !== null || general === g.general);
            return (
              <Pressable
                key={g.key}
                onPress={() => {
                  if (g.id === null && overseerVisit) {
                    // A visit is to a group; a meeting with none has no visit.
                    setOverseerVisit(false);
                    setOverseerId(null);
                    setAssistantId(null);
                  }
                  setServiceGroupId(g.id);
                  setGeneral(g.general);
                  // The place follows the choice while nobody has typed one.
                  const place =
                    g.id === null
                      ? (halls.find((h) => h.isDefault) ?? halls[0])?.address
                      : groups.find((x) => x.id === g.id)?.meetingLocation;
                  const known = [
                    ...halls.map((h) => h.address),
                    ...groups.map((x) => x.meetingLocation ?? ''),
                    '',
                  ];
                  if (place && known.includes(address.trim())) setAddress(place);
                }}
                style={[styles.segment, on && styles.segmentOn]}
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>
                  {g.name}
                </Text>
              </Pressable>
            );
          },
        )}
      </View>

      {/* When */}
      <Text style={styles.label}>{t('fieldService.sheet.when')}</Text>
      {pickDate && !editing ? (
        <>
          <View style={styles.chipWrap}>
            {quickDates.map((iso) => {
              const on = pickedDate === iso;
              return (
                <Pressable
                  key={iso}
                  onPress={() => {
                    setPickedDate(iso);
                    setCalendarOpen(false);
                  }}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {cap(fmtDay(iso))}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setCalendarOpen((v) => !v)}
              style={[
                styles.chip,
                styles.chipDashed,
                (calendarOpen || (!!pickedDate && !pickedIsQuick)) &&
                  styles.chipOn,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  styles.chipLink,
                  (calendarOpen || (!!pickedDate && !pickedIsQuick)) &&
                    styles.chipTextOn,
                ]}
              >
                {!!pickedDate && !pickedIsQuick
                  ? cap(fmtDay(pickedDate))
                  : t('fieldService.sheet.otherDate')}
              </Text>
            </Pressable>
          </View>
          {calendarOpen ? (
            <>
              <MonthCalendar
                compact
                mode="single"
                start={pickedDate || null}
                end={null}
                onChange={({ start }) => {
                  if (start) {
                    setPickedDate(start);
                    setCalendarOpen(false);
                  }
                }}
                locale={i18n.language}
                minDate={todayISO}
                marks={calendarMarks}
              />
              {calendarLegend}
            </>
          ) : null}
        </>
      ) : (
        <View style={styles.dayRow}>
          {weekDays.map(({ d, iso }) => {
            const on = d === dayOfWeek;
            const gone = iso < todayISO;
            return (
              <Pressable
                key={d}
                onPress={() => !gone && setDayOfWeek(d)}
                disabled={gone}
                style={[styles.dayChip, on && styles.dayChipOn, gone && styles.dayChipGone]}
              >
                <Text style={[styles.dayChipText, on && styles.dayChipTextOn]}>
                  {t(`fieldService.days.${d}`)}
                </Text>
                <Text style={[styles.dayChipNum, on && styles.dayChipTextOn]}>
                  {dayjs(iso).locale(i18n.language).format('D')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {/* Another week for a meeting already made (13 October 2026): until
          now it could only change its day within its own week, and a
          Saturday moved by a week had to be deleted and made again. */}
      {editing ? (
        <>
          <View style={styles.moveRow}>
            <Pressable
              onPress={() => setCalendarOpen((v) => !v)}
              style={[styles.chip, styles.chipDashed, styles.chipRow, calendarOpen && styles.chipOn]}
            >
              <Ionicons
                name="calendar-outline"
                size={14}
                color={calendarOpen ? '#fff' : '#0369a1'}
              />
              <Text style={[styles.chipText, styles.chipLink, calendarOpen && styles.chipTextOn]}>
                {t('fieldService.move.otherWeek')}
              </Text>
            </Pressable>
            {movedDay && recordDate && meetingDate ? (
              <Text style={styles.movedText}>
                {t('fieldService.move.moved', {
                  from: cap(fmtDay(recordDate)),
                  to: cap(fmtDay(meetingDate)),
                })}
              </Text>
            ) : null}
          </View>
          {calendarOpen ? (
            <>
              <MonthCalendar
                compact
                mode="single"
                start={meetingDate}
                end={null}
                onChange={({ start }) => {
                  if (start) {
                    setEditWeek(mondayOf(start));
                    setDayOfWeek(isoDow(start));
                    setCalendarOpen(false);
                  }
                }}
                locale={i18n.language}
                minDate={todayISO}
                hidePresets
                marks={calendarMarks}
              />
              {calendarLegend}
            </>
          ) : null}
        </>
      ) : null}
      <View style={styles.timeRow}>
        <Text style={styles.inlineLabel}>{t('fieldService.timeLabel')}</Text>
        <TimeField value={startTime} onChange={setStartTime} />
      </View>
      {/* What the new day already holds (16 October 2026): a clash, a meeting
          called off there, a month not yet announced. */}
      {conflictLines.length > 0 ? (
        <View style={styles.warnBox}>
          <Ionicons name="copy-outline" size={16} color="#b45309" />
          <View style={styles.warnBody}>
            <Text style={styles.warnText}>{conflictLines.join('\n')}</Text>
            <Text style={styles.warnText}>{t('fieldService.conflict.hint')}</Text>
          </View>
        </View>
      ) : null}
      {sameDayCancelled.length > 0 && (!editing || movedDay) ? (
        <View style={[styles.warnBox, styles.infoBox]}>
          <Ionicons name="information-circle-outline" size={16} color="#1d4ed8" />
          <View style={styles.warnBody}>
            <Text style={[styles.warnText, styles.infoText]}>
              {sameDayCancelled
                .map((m) =>
                  m.cancelReason?.trim()
                    ? t('fieldService.conflict.cancelledThereWhy', { time: m.startTime, reason: m.cancelReason.trim() })
                    : t('fieldService.conflict.cancelledThere', { time: m.startTime }),
                )
                .join('\n')}
            </Text>
          </View>
        </View>
      ) : null}
      {intoDraftMonth ? (
        <View style={[styles.warnBox, styles.infoBox]}>
          <Ionicons name="information-circle-outline" size={16} color="#1d4ed8" />
          <View style={styles.warnBody}>
            <Text style={[styles.warnText, styles.infoText]}>
              {t('fieldService.conflict.intoDraftMonth', { month: intoDraftMonth })}
            </Text>
          </View>
        </View>
      ) : null}
      {dayBusy.length > 0 ? (
        <View style={[styles.warnBox, dayBusy.some((b) => b.hard) && styles.hardBox]}>
          <Ionicons name="warning-outline" size={16} color="#b45309" />
          <View style={styles.warnBody}>
            <Text style={[styles.warnText, dayBusy.some((b) => b.hard) && styles.hardText]}>
              {[...new Set(dayBusy.map(hallBusyLine))]
                .map((line) => t('fieldService.form.eventWarn', { title: line }))
                .join('\n')}
              {/* An assembly, a convention, the circuit overseer's week: the
                  server does not take a meeting there (16 October 2026). */}
              {dayBusy.some((b) => b.hard) ? `\n${t('fieldService.conflict.dayTaken')}` : ''}
            </Text>
            {/* The meeting stays as planned; if it is held differently,
                the notice says so to everyone. One tap starts it. */}
            {softBusy.length > 0 && notice.trim() === '' ? (
              <Pressable
                onPress={() => setNotice(hallBusyNoticeSeed(softBusy, t))}
                hitSlop={6}
                accessibilityRole="button"
              >
                <Text style={styles.warnAction}>{t('fieldService.busy.toNotice')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Where */}
      <Text style={styles.label}>{t('fieldService.sheet.where')}</Text>
      <View style={styles.chipWrap}>
        {groupPlace ? (
          <Pressable
            onPress={() => {
              setAddress(groupPlace);
              setAddressOpen(false);
            }}
            style={[styles.chip, address.trim() === groupPlace && styles.chipOn]}
          >
            <Text
              style={[
                styles.chipText,
                address.trim() === groupPlace && styles.chipTextOn,
              ]}
            >
              {t('fieldService.sheet.groupPlace')}
            </Text>
          </Pressable>
        ) : null}
        {halls.map((h) => {
          const on = address.trim() === h.address;
          return (
            <Pressable
              key={h.id}
              onPress={() => {
                setAddress(h.address);
                setAddressOpen(false);
              }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {h.name}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setAddressOpen(true)}
          style={[styles.chip, styles.chipDashed, addressOpen && styles.chipOn]}
        >
          <Text style={[styles.chipText, styles.chipLink, addressOpen && styles.chipTextOn]}>
            {t('fieldService.sheet.otherAddress')}
          </Text>
        </Pressable>
      </View>
      {addressOpen ||
      (address.trim() !== '' &&
        address.trim() !== groupPlace &&
        !halls.some((h) => h.address === address.trim())) ? (
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder={t('fieldService.form.addressPlaceholder')}
          placeholderTextColor="#94a3b8"
          maxLength={255}
          autoFocus={addressOpen}
        />
      ) : (
        <Text style={styles.addressEcho}>{address.trim() || '—'}</Text>
      )}

      {/* What is different this time — for everyone who reads the meeting.
          Under «Где», because that is what it usually corrects; not folded
          away with the theme, which is what the meeting is about. */}
      <Text style={styles.label}>{t('fieldService.notice.label')}</Text>
      <TextInput
        style={[styles.input, styles.multiline, notice.trim() !== '' && styles.inputNotice]}
        value={notice}
        onChangeText={setNotice}
        placeholder={t('fieldService.notice.placeholder')}
        placeholderTextColor="#94a3b8"
        multiline
        maxLength={300}
      />
      <Text style={styles.noticeHint}>{t('fieldService.notice.hint')}</Text>

      {/* The visit. A visit is to a GROUP — the database refuses one without
          — so until a group is chosen the switch is off and grey, and the
          card says what to do instead of hiding: shown only after a group
          was tapped, nobody found it (Lionel, 13 October 2026). */}
      {serviceGroupId ? (
        <View style={styles.visitCard}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t('fieldService.overseerVisit')}</Text>
              <Text style={styles.toggleHint}>{t('fieldService.overseerVisitHint')}</Text>
            </View>
            <Switch
              value={overseerVisit}
              onValueChange={(on) => {
                setOverseerVisit(on);
                if (on) {
                  const holder = overseerId ?? holderOf('service_overseer');
                  if (!overseerId) setOverseerId(holder);
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
              <PublisherSelector
                boxed
                absenceDate={meetingDate ?? undefined}
                label={t('fieldService.overseer')}
                value={overseerId}
                onChange={(id) => {
                  if (conductorPublisherId === overseerId || !conductorPublisherId) {
                    setConductorPublisherId(id);
                  }
                  setOverseerId(id);
                }}
              />
              <View style={styles.assistantHead}>
                <Text style={styles.inlineLabel}>{t('fieldService.overseerAssistant')}</Text>
                {!assistantId && holderOf('service_overseer_assistant') ? (
                  <Pressable
                    hitSlop={6}
                    onPress={() => setAssistantId(holderOf('service_overseer_assistant'))}
                  >
                    <Text style={styles.fillIn}>{t('fieldService.fillAssistant')}</Text>
                  </Pressable>
                ) : null}
              </View>
              <PublisherSelector
                boxed
                absenceDate={meetingDate ?? undefined}
                label={t('fieldService.overseerAssistant')}
                value={assistantId}
                onChange={setAssistantId}
              />
              <Text style={styles.inlineLabel}>{t('fieldService.whoConducts')}</Text>
              <View style={styles.chipWrap}>
                <Pressable
                  onPress={() => setConductorPublisherId(overseerId)}
                  style={[
                    styles.chip,
                    !!overseerId && conductorPublisherId === overseerId && styles.chipOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      !!overseerId && conductorPublisherId === overseerId && styles.chipTextOn,
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
                    !!assistantId && conductorPublisherId === assistantId && styles.chipOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      !!assistantId && conductorPublisherId === assistantId && styles.chipTextOn,
                    ]}
                  >
                    {t('fieldService.overseerAssistant')}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      ) : (
        <Pressable
          style={[styles.visitCard, styles.visitCardOff]}
          onPress={() => {
            setWhoseNudge(true);
            scrollRef.current?.scrollTo({ y: 0, animated: true });
          }}
          accessibilityRole="button"
          accessibilityLabel={t('fieldService.overseerVisitNeedsGroup')}
        >
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, styles.toggleLabelOff]}>
                {t('fieldService.overseerVisit')}
              </Text>
              <Text style={styles.toggleHint}>{t('fieldService.overseerVisitNeedsGroup')}</Text>
            </View>
            <Switch
              value={false}
              disabled
              trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }}
            />
          </View>
        </Pressable>
      )}
      {sameDayNote ? (
        <Text style={styles.warnHint} testID="fs-same-day-note">
          {sameDayNote}
        </Text>
      ) : null}

      {/* Who conducts */}
      {!overseerVisit ? (
        <>
          <Text style={styles.label}>{t('fieldService.sheet.whoLeads')}</Text>
          <View style={styles.listCard}>
            {!meetingDate ? (
              <Text style={styles.listHint}>{t('fieldService.sheet.pickDayFirst')}</Text>
            ) : candidatesQuery.isLoading ? (
              <View style={styles.listHintRow}>
                <ActivityIndicator size="small" color="#0369a1" />
              </View>
            ) : candidatesQuery.isError ? (
              <Text style={styles.listHint}>{t('fieldService.sheet.listFailed')}</Text>
            ) : (
              shortlist.map((c) => {
                const on = c.publisherId === conductorPublisherId;
                return (
                  <Pressable
                    key={c.publisherId}
                    onPress={() => setConductorPublisherId(on ? null : c.publisherId)}
                    style={[styles.candidate, on && styles.candidateOn]}
                    accessibilityState={{ selected: on }}
                  >
                    <View style={styles.candidateMark}>
                      {on ? (
                        <Ionicons name="checkmark" size={18} color="#0369a1" />
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.candidateName}>{c.name}</Text>
                      <Text style={[styles.candidateWhy, !c.free && styles.candidateWhyBusy]}>
                        {reasonText(c)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
            <View style={styles.candidateMore}>
              <PublisherSelector
                label={t('fieldService.sheet.allBrothers')}
                value={conductorPublisherId}
                onChange={setConductorPublisherId}
                requiredCapability="fs_meeting_conductor"
                currentWeekStart={effectiveWeek}
                absenceDate={meetingDate ?? undefined}
              />
            </View>
          </View>
        </>
      ) : null}

      {/* Theme and material, folded */}
      {materialOpen ? (
        <>
          <Text style={styles.label}>{t('fieldService.topicLabel')}</Text>
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
                date: topicMatch.lastDate.split('-').reverse().join('.'),
              })}
            </Text>
          ) : null}
          <Text style={styles.label}>{t('fieldService.linkLabel')}</Text>
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
        </>
      ) : (
        <Pressable style={styles.foldBtn} onPress={() => setMaterialOpen(true)}>
          <Ionicons name="add" size={16} color="#0369a1" />
          <Text style={styles.foldBtnText}>{t('fieldService.sheet.addMaterial')}</Text>
        </Pressable>
      )}

      {/* Telling the people */}
      {draft ? (
        <Text style={styles.draftNote}>{t('fieldService.draft.toldOnPublish')}</Text>
      ) : (
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{t('fieldService.form.notifyConductor')}</Text>
            <Text style={styles.toggleHint}>{t('fieldService.form.notifyConductorHint')}</Text>
          </View>
          <Switch
            value={notifyConductor}
            onValueChange={setNotifyConductor}
            trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }}
          />
        </View>
      )}
      {/* The day, the hour or the place moves: the group or the whole
          congregation hears it too (Lionel, 13 October 2026). */}
      {changesForPeople && editing && !cancelOpen ? (
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{t('fieldService.audience.notify')}</Text>
            <Text style={styles.toggleHint}>
              {notifyAudience
                ? audienceName({ serviceGroupId })
                : t('fieldService.audience.off')}
            </Text>
          </View>
          <Switch
            value={notifyAudience}
            onValueChange={setNotifyAudience}
            trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }}
          />
        </View>
      ) : null}

      {editing ? (
        <View style={styles.editActions}>
          {onDuplicate ? (
            <Pressable style={styles.secondaryBtn} onPress={onDuplicate}>
              <Text style={styles.secondaryBtnText}>{t('fieldService.duplicate')}</Text>
            </Pressable>
          ) : null}
          {/* A draft is deleted; an announced meeting is called off — its
              «Удалить» steps back to a quiet link below (16 October 2026),
              so the two red buttons no longer stand side by side. */}
          {onRemove && draft ? (
            <Pressable
              style={[styles.secondaryBtn, styles.dangerBtn]}
              onPress={() => onRemove(editing.id)}
            >
              <Text style={[styles.secondaryBtnText, styles.dangerBtnText]}>
                {t('fieldService.delete')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {/* Call it off — an announced meeting only; a draft was never told to
          anyone and is simply deleted (13 October 2026). */}
      {editing && !draft && !cancelOpen ? (
        <Pressable
          style={[styles.secondaryBtn, styles.dangerBtn, styles.cancelOpenBtn]}
          onPress={() => {
            setCancelOpen(true);
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
          }}
        >
          <Ionicons name="close-circle-outline" size={16} color="#b91c1c" />
          <Text style={[styles.secondaryBtnText, styles.dangerBtnText]}>
            {t('fieldService.cancel.button')}
          </Text>
        </Pressable>
      ) : null}
      {editing && !draft && !cancelOpen && onRemove ? (
        <Pressable style={styles.deleteLink} onPress={() => onRemove(editing.id)} hitSlop={6}>
          <Text style={styles.deleteLinkText}>{t('fieldService.deleteQuiet')}</Text>
        </Pressable>
      ) : null}
      {editing && !draft && cancelOpen ? (
        <View style={styles.cancelPanel}>
          <Text style={styles.cancelTitle}>{t('fieldService.cancel.title')}</Text>
          <Text style={styles.cancelHint}>{t('fieldService.cancel.hint')}</Text>
          <Text style={styles.label}>{t('fieldService.cancel.reasonLabel')}</Text>
          <TextInput
            style={styles.input}
            value={cancelReason}
            onChangeText={setCancelReason}
            placeholder={t('fieldService.cancel.reasonPlaceholder')}
            placeholderTextColor="#94a3b8"
            maxLength={300}
          />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t('fieldService.audience.notify')}</Text>
              <Text style={styles.toggleHint}>
                {notifyAudience ? audienceName(editing) : t('fieldService.audience.off')}
              </Text>
            </View>
            <Switch
              value={notifyAudience}
              onValueChange={setNotifyAudience}
              trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }}
            />
          </View>
          <View style={styles.editActions}>
            <Pressable style={styles.secondaryBtn} onPress={() => setCancelOpen(false)}>
              <Text style={styles.secondaryBtnText}>{t('fieldService.cancel.keep')}</Text>
            </Pressable>
            <Pressable
              style={[styles.dangerFill, cancelM.isPending && styles.saveBtnOff]}
              disabled={cancelM.isPending}
              onPress={() => cancelM.mutate(editing.id)}
            >
              <Text style={styles.dangerFillText}>{t('fieldService.cancel.confirm')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

function SummaryRow({
  label,
  value,
  strong,
  last,
}: {
  label: string;
  value: string;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, last && styles.summaryRowLast]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryValueStrong]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    marginTop: 16,
    marginBottom: 8,
  },
  inlineLabel: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    marginTop: 8,
    marginBottom: 6,
  },
  segmentTrack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#e9eef4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9eef4',
    padding: 2,
    gap: 3,
  },
  segment: {
    flexGrow: 1,
    // Wide enough for its name («Hamm-Uentrop» broke in two on the phone);
    // three to a row when the names are short.
    flexBasis: 'auto',
    minWidth: '30%',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    paddingHorizontal: 6,
  },
  segmentOn: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontSize: 14, color: '#334155', fontFamily: 'Manrope_500Medium' },
  segmentTextOn: { color: '#0f172a', fontFamily: 'Manrope_700Bold' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    minHeight: 40,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: '#0369a1', borderColor: '#0369a1' },
  chipOff: { opacity: 0.45 },
  chipDashed: { borderStyle: 'dashed' },
  chipText: { fontSize: 14, color: '#334155', fontFamily: 'Manrope_500Medium' },
  chipTextOn: { color: '#ffffff', fontFamily: 'Manrope_700Bold' },
  chipLink: { color: '#0369a1' },
  dayRow: { flexDirection: 'row', gap: 4 },
  dayChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  dayChipOn: { backgroundColor: '#0369a1', borderColor: '#0369a1' },
  dayChipGone: { opacity: 0.35 },
  dayChipText: { fontSize: 12, color: '#475569', fontFamily: 'Manrope_500Medium' },
  dayChipNum: { fontSize: 15, color: '#0f172a', fontFamily: 'Manrope_700Bold' },
  dayChipTextOn: { color: '#ffffff' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  warnBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  warnText: { fontSize: 13, color: '#92400e', fontFamily: 'Manrope_500Medium' },
  warnBody: { flex: 1, gap: 6 },
  warnAction: {
    fontSize: 13.5,
    color: '#0369a1',
    fontFamily: 'Manrope_700Bold',
  },
  warnHint: {
    fontSize: 12.5,
    color: '#b45309',
    fontFamily: 'Manrope_700Bold',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    marginTop: 8,
    fontFamily: 'Manrope_500Medium',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  addressEcho: { fontSize: 13.5, color: '#64748b', marginTop: 8, fontFamily: 'Manrope_500Medium' },
  inputNotice: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  noticeHint: { fontSize: 12.5, color: '#64748b', marginTop: 6, fontFamily: 'Manrope_500Medium' },
  visitCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#dbe3ea',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  visitCardOff: { backgroundColor: '#f8fafc', borderStyle: 'dashed' },
  labelNudge: { color: '#b45309' },
  segmentTrackNudge: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  toggleLabelOff: { color: '#64748b' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  toggleLabel: { fontSize: 15, color: '#0f172a', fontFamily: 'Manrope_600SemiBold' },
  toggleHint: { fontSize: 12.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  assistantHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fillIn: { fontSize: 13, color: '#0369a1', fontFamily: 'Manrope_600SemiBold' },
  listCard: { borderWidth: 1, borderColor: '#dbe3ea', borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffff' },
  listHint: { padding: 12, fontSize: 13.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  listHintRow: { padding: 12, alignItems: 'flex-start' },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f6',
  },
  candidateOn: { backgroundColor: '#e0f2fe' },
  candidateMark: { width: 20, alignItems: 'center' },
  candidateName: { fontSize: 15, color: '#0f172a', fontFamily: 'Manrope_600SemiBold' },
  candidateWhy: { fontSize: 12.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  candidateWhyBusy: { color: '#b45309' },
  candidateMore: { paddingHorizontal: 12, paddingBottom: 4 },
  statHint: { fontSize: 12.5, color: '#64748b', marginTop: 6, fontFamily: 'Manrope_500Medium' },
  foldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  foldBtnText: { fontSize: 14, color: '#0369a1', fontFamily: 'Manrope_600SemiBold' },
  draftNote: { fontSize: 13, color: '#64748b', marginTop: 14, fontFamily: 'Manrope_500Medium' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#ffffff',
  },
  secondaryBtnText: { fontSize: 14, color: '#0369a1', fontFamily: 'Manrope_600SemiBold' },
  dangerBtn: { borderColor: '#fecaca' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  movedText: { flexShrink: 1, fontSize: 13, color: '#0369a1', fontFamily: 'Manrope_700Bold' },
  cancelOpenBtn: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 10 },
  cancelPanel: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff7f7',
  },
  cancelTitle: { fontSize: 16, color: '#991b1b', fontFamily: 'Manrope_800ExtraBold' },
  cancelHint: { fontSize: 13, color: '#475569', marginTop: 4, fontFamily: 'Manrope_500Medium' },
  dangerFill: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#b91c1c' },
  dangerFillText: { fontSize: 14.5, color: '#ffffff', fontFamily: 'Manrope_700Bold' },
  cancelledNote: { fontSize: 13.5, color: '#475569', marginTop: 10, fontFamily: 'Manrope_500Medium' },
  primaryBtn: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 16,
    backgroundColor: '#0369a1',
  },
  primaryBtnText: { fontSize: 15, color: '#ffffff', fontFamily: 'Manrope_700Bold' },
  dangerBtnText: { color: '#b91c1c' },
  footer: { gap: 8 },
  footerRow: { flexDirection: 'row', gap: 10 },
  saveHint: { fontSize: 12.5, color: '#b45309', fontFamily: 'Manrope_500Medium' },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  cancelBtnText: { fontSize: 15, color: '#334155', fontFamily: 'Manrope_600SemiBold' },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0369a1' },
  saveBtnOff: { opacity: 0.45 },
  // A clash was shown: saving is saving anyway.
  saveBtnAnyway: { backgroundColor: '#b45309' },
  deleteLink: { alignSelf: 'center', marginTop: 12, paddingVertical: 4 },
  deleteLinkText: { fontSize: 13, color: '#94a3b8', fontFamily: 'Manrope_600SemiBold', textDecorationLine: 'underline' },
  hardBox: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  hardText: { color: '#991b1b' },
  infoBox: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  infoText: { color: '#1e3a8a' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 4, marginBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 11.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  saveBtnText: { fontSize: 15, color: '#ffffff', fontFamily: 'Manrope_700Bold' },
  recordNote: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  recordNoteText: { flex: 1, fontSize: 13.5, color: '#334155', fontFamily: 'Manrope_500Medium' },
  summaryCard: { marginTop: 14, borderWidth: 1, borderColor: '#dbe3ea', borderRadius: 12, backgroundColor: '#ffffff' },
  summaryRow: { flexDirection: 'row', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f6' },
  summaryRowLast: { borderBottomWidth: 0 },
  summaryLabel: { width: 90, fontSize: 14, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  summaryValue: { flex: 1, fontSize: 14.5, color: '#0f172a', fontFamily: 'Manrope_500Medium' },
  summaryValueStrong: { fontFamily: 'Manrope_700Bold' },
});
