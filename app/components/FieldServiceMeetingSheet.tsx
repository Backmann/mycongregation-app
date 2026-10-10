import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import {
  ConductorCandidate,
  CreateFieldServiceMeetingInput,
  FieldServiceMeeting,
  UpdateFieldServiceMeetingInput,
  fieldServiceApi,
  fieldServiceStatsApi,
  hallsApi,
  isFieldServiceDraft,
  responsibilitiesApi,
  serviceGroupsApi,
  specialEventsApi,
} from '../lib/api';
import { resolveHallAddress } from '../lib/hallAddress';
import { Sheet } from './Sheet';
import { PublisherSelector } from './PublisherSelector';
import { TimeField } from './TimeField';
import { MonthCalendar } from './MonthCalendar';
import {
  startOfWeekMonday,
  formatDateISO,
  parseISODate,
  addDays,
} from '../lib/dates';
import { useAllPublishers } from '../lib/useAllPublishers';

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
 * Two kinds of meeting, by Lionel's word: the groups' own and the one for
 * the whole congregation. «Общая» IS «no group»; a meeting stored before
 * October 2026 as «no group, not general» is shown and saved as general.
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
  const [sourceUrl, setSourceUrl] = useState('');
  const [materialOpen, setMaterialOpen] = useState(false);
  const [serviceGroupId, setServiceGroupId] = useState<string | null>(null);
  const [overseerVisit, setOverseerVisit] = useState(false);
  const [overseerId, setOverseerId] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [notifyConductor, setNotifyConductor] = useState(true);

  const todayISO = formatDateISO(new Date());

  useEffect(() => {
    if (target === 'new') {
      setDayOfWeek(6);
      setPickedDate(defaultDate ?? '');
      setCalendarOpen(false);
      setStartTime(prefill?.startTime ?? '10:30');
      setAddress(prefill?.address ?? '');
      setAddressOpen(false);
      setConductorPublisherId(prefill?.conductorPublisherId ?? null);
      setTopic(prefill?.topic ?? '');
      setSourceUrl(prefill?.sourceUrl ?? '');
      setMaterialOpen(!!(prefill?.topic || prefill?.sourceUrl));
      setServiceGroupId(prefill?.serviceGroupId ?? null);
      setOverseerVisit(false);
      setOverseerId(null);
      setAssistantId(null);
      setNotifyConductor(true);
    } else if (target) {
      setDayOfWeek(target.dayOfWeek);
      setPickedDate('');
      setCalendarOpen(false);
      setStartTime(target.startTime);
      setAddress(target.address);
      setAddressOpen(false);
      setConductorPublisherId(target.conductorPublisherId);
      setTopic(target.topic ?? '');
      setSourceUrl(target.sourceUrl ?? '');
      setMaterialOpen(!!(target.topic || target.sourceUrl));
      setServiceGroupId(target.serviceGroupId ?? null);
      setOverseerVisit(target.serviceOverseerVisit ?? false);
      setOverseerId(target.serviceOverseerPublisherId ?? null);
      setAssistantId(target.serviceOverseerAssistantId ?? null);
      setNotifyConductor(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

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
  const isGeneral = serviceGroupId === null;

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
  const meetingDate: string | null = editing
    ? heldOn(editing.weekStartDate, dayOfWeek)
    : pickDate
      ? pickedDate || null
      : weekStartISO
        ? heldOn(weekStartISO, dayOfWeek)
        : null;
  const chosenPast = !isRecord && !!meetingDate && meetingDate < todayISO;
  const effectiveWeek = editing
    ? editing.weekStartDate
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
    queryKey: ['field-service', 'week', effectiveWeek, 'drafts'],
    queryFn: () =>
      fieldServiceApi.list({
        weekStart: effectiveWeek,
        weekEnd: formatDateISO(addDays(parseISODate(effectiveWeek), 7)),
        drafts: true,
      }),
    enabled: visible && !!effectiveWeek,
  });
  const sameDay = (sameWeekQuery.data ?? []).filter(
    (m) =>
      m.weekStartDate === effectiveWeek &&
      m.dayOfWeek === dayOfWeek &&
      m.id !== editing?.id,
  );
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
  const eventsQuery = useQuery({
    queryKey: ['special-events'],
    queryFn: () => specialEventsApi.list(),
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });
  const clashingEvents = meetingDate
    ? (eventsQuery.data ?? []).filter(
        (e) => e.date <= meetingDate && meetingDate <= (e.endDate ?? e.date),
      )
    : [];
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

  const submit = () => {
    if (!canSave) return;
    const visit = !isGeneral && !!serviceGroupId && overseerVisit;
    const base = {
      dayOfWeek,
      startTime,
      address: address.trim(),
      conductorPublisherId,
      topic: topic.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
      // Two kinds only: a group's own, or everybody's.
      isGeneral,
      serviceGroupId,
      serviceOverseerVisit: visit,
      serviceOverseerPublisherId: visit ? overseerId : null,
      serviceOverseerAssistantId: visit ? assistantId : null,
      notifyConductor: draft ? false : notifyConductor,
    };
    if (editing) {
      onUpdate(editing.id, base);
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
      : t('fieldService.generalBadge')
    : null;
  const title = editing
    ? `${cap(fmtDayLong(recordDate!))} · ${editing.startTime}`
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
        variant="bottom"
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
      variant="bottom"
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      closeLabel={t('common.close')}
      hideClose
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
              style={[styles.saveBtn, !canSave && styles.saveBtnOff]}
              onPress={submit}
              disabled={!canSave}
            >
              <Text style={styles.saveBtnText}>{t('fieldService.form.save')}</Text>
            </Pressable>
          </View>
        </View>
      }
    >
      {/* Whose */}
      <Text style={styles.label}>{t('fieldService.sheet.whose')}</Text>
      <View style={styles.segmentTrack}>
        {[{ id: null as string | null, name: t('fieldService.sheet.general') }, ...groups].map(
          (g) => {
            const on = serviceGroupId === g.id;
            return (
              <Pressable
                key={g.id ?? 'general'}
                onPress={() => {
                  if (g.id === null && overseerVisit) {
                    // A visit is to a group; everybody's meeting has none.
                    setOverseerVisit(false);
                    setOverseerId(null);
                    setAssistantId(null);
                  }
                  setServiceGroupId(g.id);
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
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
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
            />
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
      <View style={styles.timeRow}>
        <Text style={styles.inlineLabel}>{t('fieldService.timeLabel')}</Text>
        <TimeField value={startTime} onChange={setStartTime} />
      </View>
      {clashingEvents.length > 0 ? (
        <View style={styles.warnBox}>
          <Ionicons name="warning-outline" size={16} color="#b45309" />
          <Text style={styles.warnText}>
            {clashingEvents
              .map((e) => t('fieldService.form.eventWarn', { title: e.title }))
              .join('\n')}
          </Text>
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

      {/* The visit, when it is a group's meeting */}
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
      ) : null}
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

      {editing ? (
        <View style={styles.editActions}>
          {onDuplicate ? (
            <Pressable style={styles.secondaryBtn} onPress={onDuplicate}>
              <Text style={styles.secondaryBtnText}>{t('fieldService.duplicate')}</Text>
            </Pressable>
          ) : null}
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
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    marginTop: 16,
    marginBottom: 8,
  },
  inlineLabel: {
    fontSize: 13,
    fontWeight: '600',
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
    padding: 3,
    gap: 3,
  },
  segment: {
    flexGrow: 1,
    flexBasis: '30%',
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
  segmentTextOn: { color: '#0f172a', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
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
  chipTextOn: { color: '#ffffff', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
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
  dayChipNum: { fontSize: 15, color: '#0f172a', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
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
  warnText: { flex: 1, fontSize: 13, color: '#92400e', fontFamily: 'Manrope_500Medium' },
  warnHint: {
    fontSize: 12.5,
    color: '#b45309',
    fontWeight: '700',
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
  visitCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#dbe3ea',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#0f172a', fontFamily: 'Manrope_600SemiBold' },
  toggleHint: { fontSize: 12.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  assistantHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fillIn: { fontSize: 13, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
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
  candidateName: { fontSize: 15, fontWeight: '600', color: '#0f172a', fontFamily: 'Manrope_600SemiBold' },
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
  foldBtnText: { fontSize: 14, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
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
  secondaryBtnText: { fontSize: 14, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  dangerBtn: { borderColor: '#fecaca' },
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
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#334155', fontFamily: 'Manrope_600SemiBold' },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0369a1' },
  saveBtnOff: { opacity: 0.45 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff', fontFamily: 'Manrope_700Bold' },
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
  summaryValueStrong: { fontWeight: '700', fontFamily: 'Manrope_700Bold' },
});
