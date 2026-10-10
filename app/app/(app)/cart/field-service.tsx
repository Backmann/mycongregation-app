import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  CoVisitFieldServiceMeeting,
  CreateFieldServiceMeetingInput,
  FieldServiceMeeting,
  coVisitItemsApi,
  Publisher,
  UpdateFieldServiceMeetingInput,
  fieldServiceApi,
  fieldServiceMonthThemeApi,
  isFieldServiceDraft,
  publishersApi,
  hallsApi,
  meetingSettingsApi,
  serviceGroupsApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { FieldNoteLine, useFieldListViewer } from '../../../components/FieldListBits';
import { FieldServiceForm } from '../../../components/FieldServiceMeetingSheet';
import { resolveHallAddress } from '../../../lib/hallAddress';
import { FieldServiceGenerateModal } from '../../../components/FieldServiceGenerateModal';
import { FieldServicePrepareSheet } from '../../../components/FieldServicePrepareSheet';
import { buildFieldServicePdfHtml } from '../../../lib/fieldServicePdf';
import type { FsPdfMonth } from '../../../lib/fieldServicePdf';
import { exportHtmlAsPdf } from '../../../lib/pdf';
import { MyDot } from '../../../components/MyDot';
import { MyGlowRow } from '../../../components/MyGlowRow';
import { notify } from '../../../lib/error-bus';
import { parseISODate, addDays, formatDateISO } from '../../../lib/dates';
import { HEADER_ICON } from '../../../lib/header';
import { LoadError } from '../../../components/LoadError';
import { Dialog } from '../../../components/Dialog';
import { SourceLink } from '../../../components/SourceLink';
import { confirm } from '../../../components/ConfirmHost';
import { failsScreen } from '../../../lib/screen-failure';

/**
 * The month of field-service meetings (rebuilt October 2026, stage 3a).
 *
 * Days, not cards: every meeting of a Saturday stands under that Saturday,
 * one line each — the time, whose meeting, who conducts, where. The old page
 * drew each meeting as its own card with badges stacked inside, and a month
 * of eight meetings scrolled for two screens.
 *
 * A month still being prepared is a DRAFT: the server gives drafts only to
 * the planners, and only when asked (`drafts: true`), so this page asks for
 * them when the reader may edit — and shows, above such a month, what the
 * draft holds and the button that announces it.
 */

/** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
function isoDayOf(dateISO: string): number {
  const day = parseISODate(dateISO).getDay();
  return day === 0 ? 7 : day;
}

function meetingDateISO(m: FieldServiceMeeting): string {
  return formatDateISO(addDays(parseISODate(m.weekStartDate), m.dayOfWeek - 1));
}

/**
 * The day a new entry in a "YYYY-MM" month starts on: its first Saturday —
 * but never a day already gone. In the month being lived that is the next
 * Saturday from today, or today itself once no Saturday is left. Until
 * 9 October 2026 it was always the month's first Saturday, so a meeting added
 * on the 9th opened on the 3rd, a day the server no longer accepts.
 */
function defaultDayOf(monthKey: string, todayISO: string): string {
  const first = `${monthKey}-01`;
  let d = dayjs(first < todayISO ? todayISO : first);
  while (d.day() !== 6 && d.format('YYYY-MM') === monthKey) d = d.add(1, 'day');
  return d.format('YYYY-MM') === monthKey ? d.format('YYYY-MM-DD') : todayISO;
}

/** One line of a day: a meeting of ours, or an outing of the CO visit. */
type DayLine =
  | { kind: 'meeting'; time: string; meeting: FieldServiceMeeting }
  | { kind: 'visit'; time: string; visit: CoVisitFieldServiceMeeting };

type DayBlock = { dateISO: string; lines: DayLine[] };

type MonthBlock = {
  key: string;
  title: string;
  meetings: FieldServiceMeeting[];
  days: DayBlock[];
  drafts: FieldServiceMeeting[];
};

export default function FieldServiceMeetingsScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const perms = usePermissions();
  const canEdit = perms.canEditFieldServiceMeetings;
  const qc = useQueryClient();

  const scrollRef = useRef<ScrollView>(null);
  const monthOffsets = useRef<Record<string, number>>({});
  const dayOffsets = useRef<Record<string, { monthKey: string; y: number }>>({});
  // Чип месяца подсвечивает БЛОК, видимый на экране (синхронизируется со
  // скроллом), а не календарный текущий месяц — иначе при прокрутке к
  // августу остаётся подсвечен июль и кажется, что фильтр сломан.
  const [activeMonthKey, setActiveMonthKey] = useState<string>(
    dayjs().format('YYYY-MM'),
  );
  const didInitialScroll = useRef(false);

  // The planners read the drafts too; everybody else the announced schedule.
  // Two keys, so a planner's drafts never land in the cache the Home screen
  // and the Programme feed read from.
  const meetingsQuery = useQuery({
    throwOnError: failsScreen,
    queryKey: ['field-service', 'all', canEdit ? 'drafts' : 'public'],
    queryFn: () => fieldServiceApi.list({ drafts: canEdit }),
  });
  // During a circuit-overseer visit the field service is planned in the
  // visit schedule, not here — so this page, and the sheet printed from it,
  // left that week empty exactly when there was most going on (found
  // 9 October 2026). Shown, not edited: they belong to the visit.
  const coVisitQuery = useQuery({
    queryKey: ['co-visit-field-service'],
    queryFn: () => coVisitItemsApi.fieldService(),
    staleTime: 5 * 60 * 1000,
  });
  const visitByMonth = new Map<string, CoVisitFieldServiceMeeting[]>();
  for (const v of (coVisitQuery.data ?? []).flatMap((w) => w.meetings)) {
    const k = v.itemDate.slice(0, 7);
    visitByMonth.set(k, [...(visitByMonth.get(k) ?? []), v]);
  }
  const publishersQuery = useQuery({
    // Names-only roster: the full directory is restricted to the caller's own
    // group for regular publishers, which broke conductor name resolution
    // here. The roster is open to every member and carries id + displayName.
    queryKey: ['publishers', 'roster'],
    queryFn: () => publishersApi.roster(),
    staleTime: 5 * 60 * 1000,
  });
  const publishersById = new Map<string, Publisher>(
    (publishersQuery.data?.data ?? []).map((p) => [p.id, p]),
  );
  const nameOf = (id: string | null | undefined) =>
    id ? (publishersById.get(id)?.displayName ?? null) : null;
  const viewer = useFieldListViewer(meetingsQuery.data ?? []);
  const overviewQuery = useQuery({
    queryKey: ['meeting-settings-overview'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 5 * 60 * 1000,
  });
  const groupsQuery = useQuery({
    queryKey: ['service-groups'],
    queryFn: () => serviceGroupsApi.list({}),
  });
  const groupName = (id: string) =>
    (groupsQuery.data?.data ?? []).find(
      (g: { id: string; name: string }) => g.id === id,
    )?.name ?? '';

  const hallsQuery = useQuery({
    queryKey: ['halls'],
    queryFn: () => hallsApi.list(),
    staleTime: 5 * 60 * 1000,
  });
  const halls = hallsQuery.data ?? [];
  const themesQuery = useQuery({
    queryKey: ['field-service-month-themes'],
    queryFn: () => fieldServiceMonthThemeApi.list(),
  });
  const themeByMonth = new Map<string, string>(
    (themesQuery.data ?? []).map((tm) => [
      `${tm.year}-${String(tm.month).padStart(2, '0')}`,
      tm.theme,
    ]),
  );

  // --- Month-theme editor ---
  const [themeEdit, setThemeEdit] = useState<{
    monthKey: string;
    value: string;
  } | null>(null);
  const themeM = useMutation({
    mutationFn: (vars: { year: number; month: number; theme: string }) =>
      fieldServiceMonthThemeApi.upsert(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-service-month-themes'] });
      setThemeEdit(null);
    },
  });
  const saveTheme = () => {
    if (!themeEdit) return;
    themeM.mutate({
      year: Number(themeEdit.monthKey.slice(0, 4)),
      month: Number(themeEdit.monthKey.slice(5, 7)),
      theme: themeEdit.value,
    });
  };

  // --- Form state ---
  const [target, setTarget] = useState<FieldServiceMeeting | 'new' | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfStart, setPdfStart] = useState(() => dayjs().format('YYYY-MM'));
  const [pdfMonths, setPdfMonths] = useState(2);
  const [addDefaultDate, setAddDefaultDate] = useState<string | undefined>();
  const [addAsDraft, setAddAsDraft] = useState(false);
  const [prefill, setPrefill] = useState<
    | {
        startTime?: string;
        address?: string;
        topic?: string;
        sourceUrl?: string;
        isGeneral?: boolean;
        conductorPublisherId?: string | null;
        serviceGroupId?: string | null;
      }
    | undefined
  >();
  const [genOpen, setGenOpen] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);

  // The printed sheet: a button in the header, where the mockup put it, so
  // the row under the month strip is left to what is done to the plan.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setPdfOpen(true)}
          style={{ paddingHorizontal: 10 }}
          hitSlop={8}
          accessibilityLabel={t('fieldService.pdf.title')}
        >
          <Ionicons name="download-outline" size={22} color={HEADER_ICON} />
        </Pressable>
      ),
    });
  }, [navigation, t]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['field-service'] });
    qc.invalidateQueries({ queryKey: ['field-service-topic-history'] });
    // The service overseer's group counts are DERIVED from these very
    // meetings: mark a visit here and «кого давно не посещали» changes there.
    qc.invalidateQueries({ queryKey: ['service-overseer'] });
  };

  const createM = useMutation({
    mutationFn: (input: CreateFieldServiceMeetingInput) =>
      fieldServiceApi.create(input),
    onSuccess: () => {
      invalidate();
      setTarget(null);
    },
  });
  const updateM = useMutation({
    mutationFn: (vars: { id: string; input: UpdateFieldServiceMeetingInput }) =>
      fieldServiceApi.update(vars.id, vars.input),
    onSuccess: () => {
      invalidate();
      setTarget(null);
    },
  });
  const removeM = useMutation({
    mutationFn: (id: string) => fieldServiceApi.remove(id),
    onSuccess: () => invalidate(),
  });
  const publishM = useMutation({
    mutationFn: (vars: { year: number; month: number }) =>
      fieldServiceApi.publish(vars),
    onSuccess: (out) => {
      invalidate();
      notify(
        t('fieldService.draft.publishedTitle'),
        t('fieldService.draft.publishedBody', {
          count: out.published,
          people: out.notified,
        }),
        'success',
      );
    },
  });
  // Fill the empty conductors of a draft month, one by one, with the first
  // brother the server calls free for that day. The same list the window
  // shows — this only saves the planner the taps.
  const fillM = useMutation({
    mutationFn: async (drafts: FieldServiceMeeting[]) => {
      let filled = 0;
      let left = 0;
      for (const m of drafts) {
        const list = await fieldServiceApi.suggestConductor({
          date: meetingDateISO(m),
          serviceGroupId: m.serviceGroupId,
          conductorRule: m.serviceGroupId ? 'group_overseer' : 'rotation',
          excludeMeetingId: m.id,
        });
        const pick = list.find((c) => c.free);
        if (!pick) {
          left += 1;
          continue;
        }
        await fieldServiceApi.update(m.id, {
          conductorPublisherId: pick.publisherId,
          notifyConductor: false,
        });
        filled += 1;
      }
      return { filled, left };
    },
    onSuccess: (out) => {
      invalidate();
      notify(
        t('fieldService.draft.filledTitle'),
        out.left
          ? t('fieldService.draft.filledSome', { count: out.filled, left: out.left })
          : t('fieldService.draft.filledAll', { count: out.filled }),
        out.left ? 'error' : 'success',
      );
    },
  });

  const confirmRemove = async (id: string) => {
    if (
      await confirm({
        title: t('fieldService.delete'),
        body: t('fieldService.deleteConfirm'),
        confirmLabel: t('fieldService.delete'),
        danger: true,
      })
    ) {
      setTarget(null);
      removeM.mutate(id);
    }
  };

  const confirmPublish = async (m: MonthBlock) => {
    if (
      await confirm({
        title: t('fieldService.draft.publish'),
        body: t('fieldService.draft.publishConfirm', {
          month: m.title.charAt(0).toLowerCase() + m.title.slice(1),
          count: m.drafts.length,
        }),
        confirmLabel: t('fieldService.draft.publish'),
      })
    ) {
      publishM.mutate({
        year: Number(m.key.slice(0, 4)),
        month: Number(m.key.slice(5, 7)),
      });
    }
  };

  if (meetingsQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }
  if (meetingsQuery.isError) {
    return (
      <View style={styles.container}>
        <LoadError onRetry={() => meetingsQuery.refetch()} />
      </View>
    );
  }

  // --- Build continuous month blocks (data span ∪ current month) ---
  const meetings = meetingsQuery.data ?? [];
  const byMonth = new Map<string, FieldServiceMeeting[]>();
  for (const m of meetings) {
    const k = meetingDateISO(m).slice(0, 7);
    const arr = byMonth.get(k);
    if (arr) arr.push(m);
    else byMonth.set(k, [m]);
  }
  const currentMonthKey = dayjs().format('YYYY-MM');
  const todayISO = formatDateISO(new Date());
  // Monday of the current week, worked out with the helpers already in this
  // file — dayjs's isoWeek needs a plugin that is not loaded here.
  const currentWeekStart = (() => {
    const now = new Date();
    const dow = now.getDay() === 0 ? 7 : now.getDay();
    return formatDateISO(addDays(now, 1 - dow));
  })();
  let minK = currentMonthKey;
  let maxK = currentMonthKey;
  for (const k of [...byMonth.keys(), ...visitByMonth.keys()]) {
    if (k < minK) minK = k;
    if (k > maxK) maxK = k;
  }
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const months: MonthBlock[] = [];
  {
    let d = dayjs(`${minK}-01`);
    const end = dayjs(`${maxK}-01`);
    while (d.isBefore(end) || d.isSame(end)) {
      const k = d.format('YYYY-MM');
      const ms = (byMonth.get(k) ?? [])
        .slice()
        .sort(
          (a, b) =>
            meetingDateISO(a).localeCompare(meetingDateISO(b)) ||
            a.startTime.localeCompare(b.startTime),
        );
      const lines: (DayLine & { dateISO: string })[] = [
        ...ms.map((m) => ({
          kind: 'meeting' as const,
          dateISO: meetingDateISO(m),
          time: m.startTime,
          meeting: m,
        })),
        ...(visitByMonth.get(k) ?? []).map((v) => ({
          kind: 'visit' as const,
          dateISO: v.itemDate,
          time: v.startTime ?? '',
          visit: v,
        })),
      ].sort(
        (a, b) => a.dateISO.localeCompare(b.dateISO) || a.time.localeCompare(b.time),
      );
      const days: DayBlock[] = [];
      for (const line of lines) {
        const last = days[days.length - 1];
        if (last && last.dateISO === line.dateISO) last.lines.push(line);
        else days.push({ dateISO: line.dateISO, lines: [line] });
      }
      months.push({
        key: k,
        title: cap(
          d.toDate().toLocaleDateString(i18n.language, {
            month: 'long',
            year: 'numeric',
          }),
        ),
        meetings: ms,
        days,
        drafts: ms.filter(isFieldServiceDraft),
      });
      d = d.add(1, 'month');
    }
  }

  /**
   * Open on THIS WEEK, not merely this month: the week people come here for
   * is almost always the one they are living in. The month is the fallback.
   */
  const currentWeekDayKey = (() => {
    for (const m of months) {
      for (const day of m.days) {
        const monday = formatDateISO(
          addDays(parseISODate(day.dateISO), 1 - isoDayOf(day.dateISO)),
        );
        if (monday === currentWeekStart) return day.dateISO;
      }
    }
    return null;
  })();

  const scrollToCurrent = () => {
    if (didInitialScroll.current) return;
    const rel = currentWeekDayKey ? dayOffsets.current[currentWeekDayKey] : null;
    const monthOff = rel ? monthOffsets.current[rel.monthKey] : null;
    const precise = !!rel && monthOff != null;
    // Give up the right to try again ONLY once the exact spot is known — or
    // once it is clear there is nothing exact to find. On Android the first
    // attempt comes before both halves of the sum exist.
    const off = precise
      ? (monthOff as number) + (rel as { y: number }).y
      : monthOffsets.current[currentMonthKey];
    if (off == null) return;
    if (precise || !currentWeekDayKey) didInitialScroll.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(off - 8, 0), animated: false });
  };
  const scrollToMonth = (key: string) => {
    setActiveMonthKey(key);
    const off = monthOffsets.current[key];
    if (off != null)
      scrollRef.current?.scrollTo({ y: Math.max(off - 8, 0), animated: true });
  };

  /** Highlight the month block currently at the top of the viewport. */
  const syncActiveMonth = (y: number) => {
    let best: string | null = null;
    let bestOff = -Infinity;
    for (const [key, off] of Object.entries(monthOffsets.current)) {
      if (off <= y + 40 && off > bestOff) {
        best = key;
        bestOff = off;
      }
    }
    if (best && best !== activeMonthKey) setActiveMonthKey(best);
  };

  const exportPdf = async () => {
    const monthsOut: FsPdfMonth[] = [];
    for (let i = 0; i < pdfMonths; i++) {
      const key = dayjs(`${pdfStart}-01`).add(i, 'month').format('YYYY-MM');
      // The printed sheet is the announced plan: a draft stays off it.
      const list = (byMonth.get(key) ?? [])
        .filter((m) => !isFieldServiceDraft(m))
        .sort(
          (a, b) =>
            meetingDateISO(a).localeCompare(meetingDateISO(b)) ||
            a.startTime.localeCompare(b.startTime),
        );
      monthsOut.push({
        title: dayjs(`${key}-01`)
          .toDate()
          .toLocaleDateString(i18n.language, {
            month: 'long',
            year: 'numeric',
          }),
        theme: themeByMonth.get(key) ?? null,
        rows: [
          ...list.map((m) => {
            const dateISO = meetingDateISO(m);
            return {
              dateISO,
              dayLabel: parseISODate(dateISO).toLocaleDateString(i18n.language, {
                weekday: 'short',
              }),
              time: m.startTime,
              address: resolveHallAddress(m.address, halls),
              topic: m.topic ?? null,
              conductorName: nameOf(m.conductorPublisherId),
              isGeneral: m.isGeneral,
              groupName: m.serviceGroupId ? groupName(m.serviceGroupId) : null,
              isOverseerVisit: !!m.serviceOverseerVisit,
              overseerName: nameOf(m.serviceOverseerPublisherId),
              assistantName: nameOf(m.serviceOverseerAssistantId),
              fromCoVisit: false,
            };
          }),
          ...(visitByMonth.get(key) ?? []).map((v) => ({
            dateISO: v.itemDate,
            dayLabel: parseISODate(v.itemDate).toLocaleDateString(i18n.language, {
              weekday: 'short',
            }),
            time: v.startTime ?? '',
            address: v.place ? resolveHallAddress(v.place, halls) : '',
            topic: null,
            conductorName: null,
            isGeneral: false,
            groupName: null,
            isOverseerVisit: false,
            overseerName: null,
            assistantName: null,
            fromCoVisit: true,
          })),
        ].sort(
          (a, b) =>
            a.dateISO.localeCompare(b.dateISO) || a.time.localeCompare(b.time),
        ),
      });
    }
    const startT = dayjs(`${pdfStart}-01`)
      .toDate()
      .toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
    const endT = dayjs(`${pdfStart}-01`)
      .add(pdfMonths - 1, 'month')
      .toDate()
      .toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
    const html = buildFieldServicePdfHtml({
      congregationName: overviewQuery.data?.congregation.name ?? null,
      rangeLabel: pdfMonths === 1 ? startT : `${startT} – ${endT}`,
      generatedDate: new Date().toLocaleDateString(i18n.language),
      months: monthsOut,
      labels: {
        title: t('fieldService.pdf.title'),
        date: t('fieldService.pdf.date'),
        time: t('fieldService.pdf.time'),
        address: t('fieldService.pdf.address'),
        conductor: t('fieldService.conductor'),
        general: t('fieldService.generalBadge'),
        overseerVisit: t('fieldService.overseerVisitBadgeShort'),
        groupVisit: t('fieldService.pdf.groupVisit'),
        assistant: t('fieldService.overseerAssistant'),
        monthTheme: t('fieldService.pdf.monthTheme'),
        fromCoVisit: t('fieldService.fromCoVisit'),
        generated: t('fieldService.pdf.generated'),
      },
    });
    const ok = await exportHtmlAsPdf(html, {
      fileName: t('fieldService.pdf.title'),
    });
    if (!ok.ok && ok.reason === 'popup_blocked') {
      notify(t('fieldService.pdf.blocked'));
    }
    setPdfOpen(false);
  };

  const openAdd = (m: MonthBlock) => {
    setAddDefaultDate(defaultDayOf(m.key, todayISO));
    setPrefill(undefined);
    // Into a month still being prepared, a new meeting is a draft like the
    // rest: one announcement for the whole month.
    setAddAsDraft(m.drafts.length > 0);
    setTarget('new');
  };

  const fmtDayHead = (iso: string) =>
    cap(dayjs(iso).locale(i18n.language).format('dd, D MMMM'));

  /** The one line under a meeting: who conducts, or that nobody does yet. */
  const whoLine = (m: FieldServiceMeeting): { text: string; empty: boolean } => {
    const conductor = nameOf(m.conductorPublisherId);
    if (!conductor) return { text: t('fieldService.row.unassigned'), empty: true };
    const bits = [t('fieldService.row.leads', { name: conductor })];
    if (m.serviceOverseerVisit) {
      const assistant =
        m.serviceOverseerAssistantId &&
        m.serviceOverseerAssistantId !== m.conductorPublisherId
          ? nameOf(m.serviceOverseerAssistantId)
          : null;
      const overseer =
        m.serviceOverseerPublisherId &&
        m.serviceOverseerPublisherId !== m.conductorPublisherId
          ? nameOf(m.serviceOverseerPublisherId)
          : null;
      if (overseer) bits.push(t('fieldService.row.withOverseer', { name: overseer }));
      if (assistant) bits.push(t('fieldService.row.withAssistant', { name: assistant }));
    }
    return { text: bits.join(' · '), empty: false };
  };

  return (
    <View style={styles.container}>
      {/* Month strip; the one action on the plan at its right. */}
      <View style={styles.monthBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthBarInner}
          style={styles.monthBarScroll}
        >
          {months.map((m) => (
            <Pressable
              key={m.key}
              style={[
                styles.monthChip,
                m.key === activeMonthKey && styles.monthChipCurrent,
              ]}
              onPress={() => scrollToMonth(m.key)}
            >
              <Text
                style={[
                  styles.monthChipText,
                  m.key === activeMonthKey && styles.monthChipTextCurrent,
                ]}
              >
                {dayjs(`${m.key}-01`)
                  .toDate()
                  .toLocaleDateString(i18n.language, { month: 'short' })}
                {m.drafts.length > 0 ? ` · ${t('fieldService.draft.chip')}` : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {canEdit && (
          <Pressable
            style={styles.planBtn}
            onPress={() => setPrepareOpen(true)}
            accessibilityLabel={t('fieldService.prepare.button')}
          >
            <Ionicons name="add" size={16} color="#0369a1" />
            <Text style={styles.planBtnText}>{t('fieldService.prepare.button')}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 48 }}
        onContentSizeChange={scrollToCurrent}
        onScroll={(e) => syncActiveMonth(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={48}
      >
        {months.map((m) => (
          <View
            key={m.key}
            onLayout={(e) => {
              monthOffsets.current[m.key] = e.nativeEvent.layout.y;
              // The month is measured after its children, so this is the
              // first moment both halves of the sum are known.
              scrollToCurrent();
            }}
            style={styles.monthSection}
          >
            <Text
              style={[
                styles.monthTitle,
                m.key === currentMonthKey && styles.monthTitleCurrent,
              ]}
            >
              {m.title}
            </Text>
            {(() => {
              const theme = themeByMonth.get(m.key);
              if (theme) {
                return (
                  <Pressable
                    style={styles.themeRow}
                    onPress={() =>
                      canEdit && setThemeEdit({ monthKey: m.key, value: theme })
                    }
                    disabled={!canEdit}
                  >
                    <Text style={styles.themeLabel}>
                      {t('fieldService.monthTheme.add')}:{' '}
                      <Text style={styles.themeText}>{theme}</Text>
                    </Text>
                  </Pressable>
                );
              }
              if (canEdit) {
                return (
                  <Pressable
                    style={styles.themeRow}
                    onPress={() => setThemeEdit({ monthKey: m.key, value: '' })}
                  >
                    <Text style={styles.themeLabel}>
                      {t('fieldService.monthTheme.add')}:{' '}
                      <Text style={styles.themeAddText}>{t('fieldService.monthTheme.addLink')}</Text>
                    </Text>
                  </Pressable>
                );
              }
              return null;
            })()}

            {/* What the draft holds, and the button that announces it. */}
            {canEdit && m.drafts.length > 0 ? (
              <View style={styles.draftCard}>
                <Text style={styles.draftTitle}>
                  {t('fieldService.draft.title', { month: m.title })}
                </Text>
                <Text style={styles.draftLine}>
                  {t('fieldService.draft.count', { count: m.drafts.length })}
                </Text>
                {m.drafts.some((d) => !d.conductorPublisherId) ? (
                  <Text style={[styles.draftLine, styles.draftLineWarn]}>
                    {t('fieldService.draft.noConductor', {
                      count: m.drafts.filter((d) => !d.conductorPublisherId).length,
                    })}
                  </Text>
                ) : null}
                <Text style={styles.draftHint}>{t('fieldService.draft.hint')}</Text>
                <View style={styles.draftActions}>
                  {m.drafts.some((d) => !d.conductorPublisherId) ? (
                    <Pressable
                      style={styles.draftSecondary}
                      disabled={fillM.isPending}
                      onPress={() =>
                        fillM.mutate(
                          m.drafts.filter(
                            (d) => !d.conductorPublisherId && meetingDateISO(d) >= todayISO,
                          ),
                        )
                      }
                    >
                      {fillM.isPending ? (
                        <ActivityIndicator size="small" color="#0369a1" />
                      ) : (
                        <Text style={styles.draftSecondaryText}>
                          {t('fieldService.draft.fill')}
                        </Text>
                      )}
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={styles.draftPrimary}
                    disabled={publishM.isPending}
                    onPress={() => void confirmPublish(m)}
                  >
                    {publishM.isPending ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.draftPrimaryText}>
                        {t('fieldService.draft.publish')}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            {m.days.length === 0 ? (
              <Text style={styles.emptyMonth}>{t('fieldService.emptyMonth')}</Text>
            ) : (
              m.days.map((day) => (
                <View
                  key={day.dateISO}
                  style={styles.dayCard}
                  onLayout={(e) => {
                    // Relative to its month; the month's own offset is added
                    // only when scrolling (children are measured first).
                    dayOffsets.current[day.dateISO] = {
                      monthKey: m.key,
                      y: e.nativeEvent.layout.y,
                    };
                    if (day.dateISO === currentWeekDayKey) scrollToCurrent();
                  }}
                >
                  <View style={styles.dayHead}>
                    <Text style={styles.dayHeadText}>
                      {fmtDayHead(day.dateISO)}
                      {day.lines.length > 1
                        ? ` · ${t('fieldService.row.count', { count: day.lines.length })}`
                        : ''}
                    </Text>
                  </View>
                  {day.lines.map((line, i) => {
                    const last = i === day.lines.length - 1;
                    if (line.kind === 'visit') {
                      const v = line.visit;
                      return (
                        <View key={`v-${v.id}`} style={[styles.row, last && styles.rowLast]}>
                          <Text style={styles.rowTime}>{v.startTime ?? '—'}</Text>
                          <View style={styles.rowBody}>
                            <View style={styles.rowTitleLine}>
                              <Text style={styles.rowTitle}>{t('fieldService.row.coVisit')}</Text>
                            </View>
                            {v.place ? (
                              <Text style={styles.rowMuted} numberOfLines={2}>
                                {resolveHallAddress(v.place, halls)}
                              </Text>
                            ) : null}
                            <Text style={styles.rowFaint}>{t('fieldService.fromCoVisitHint')}</Text>
                          </View>
                        </View>
                      );
                    }
                    const mt = line.meeting;
                    const isMine = viewer.isMine(mt);
                    const who = whoLine(mt);
                    const RowWrap = isMine ? MyGlowRow : View;
                    const place = resolveHallAddress(mt.address, halls);
                    return (
                      <RowWrap
                        key={mt.id}
                        kind="field_service"
                        style={[styles.row, last && styles.rowLast, isMine && styles.rowMine]}
                      >
                        <Pressable
                          style={styles.rowPress}
                          onPress={() => canEdit && setTarget(mt)}
                          disabled={!canEdit}
                        >
                          <Text style={styles.rowTime}>{mt.startTime}</Text>
                          <View style={styles.rowBody}>
                            <View style={styles.rowTitleLine}>
                              {isMine && mt.conductorPublisherId === viewer.me ? (
                                <MyDot kind="field_service" />
                              ) : null}
                              <Text style={styles.rowTitle}>
                                {mt.serviceGroupId
                                  ? t('fieldService.row.group', {
                                      group: groupName(mt.serviceGroupId),
                                    })
                                  : mt.isGeneral
                                    ? t('fieldService.generalBadge')
                                    : t('fieldService.row.byGroups')}
                              </Text>
                              {mt.serviceOverseerVisit ? (
                                <View style={styles.visitBadge}>
                                  <Text style={styles.visitBadgeText}>
                                    {t('fieldService.row.visitBadge')}
                                  </Text>
                                </View>
                              ) : null}
                              {isFieldServiceDraft(mt) ? (
                                <View style={styles.draftBadge}>
                                  <Text style={styles.draftBadgeText}>
                                    {t('fieldService.draft.badge')}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={[styles.rowWho, who.empty && styles.rowWhoEmpty]}>
                              {who.text}
                            </Text>
                            <Text style={styles.rowMuted} numberOfLines={2}>
                              {[place, mt.topic].filter(Boolean).join(' · ')}
                            </Text>
                            <FieldNoteLine note={viewer.noteOf(mt.id)} groupName={groupName} />
                            <SourceLink url={mt.sourceUrl} />
                          </View>
                          {canEdit ? (
                            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                          ) : null}
                        </Pressable>
                      </RowWrap>
                    );
                  })}
                </View>
              ))
            )}

            {/* A month already over takes no new meetings. */}
            {canEdit && m.key >= currentMonthKey && (
              <Pressable style={styles.addBtn} onPress={() => openAdd(m)}>
                <Ionicons name="add" size={18} color="#0369a1" />
                <Text style={styles.addBtnText}>{t('fieldService.addEntry')}</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      <FieldServiceForm
        target={target}
        weekStartISO={target && target !== 'new' ? target.weekStartDate : ''}
        pickDate={target === 'new'}
        defaultDate={addDefaultDate}
        asDraft={addAsDraft}
        prefill={prefill}
        onRemove={(id) => void confirmRemove(id)}
        onDuplicate={() => {
          if (target === null || target === 'new') return;
          const mt = target;
          setPrefill({
            startTime: mt.startTime,
            address: mt.address,
            topic: mt.topic ?? '',
            sourceUrl: mt.sourceUrl ?? '',
            isGeneral: mt.isGeneral,
            conductorPublisherId: mt.conductorPublisherId,
            serviceGroupId: mt.serviceGroupId,
          });
          setAddDefaultDate(undefined);
          setAddAsDraft(false);
          setTarget('new');
        }}
        onClose={() => {
          setTarget(null);
          setPrefill(undefined);
        }}
        onCreate={(input) => createM.mutate(input)}
        onUpdate={(id, input) => updateM.mutate({ id, input })}
      />

      <Modal
        visible={themeEdit !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setThemeEdit(null)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setThemeEdit(null)}
          />
          <View style={styles.themeCard}>
            <Text style={styles.themeCardTitle}>
              {t('fieldService.monthTheme.title')}
            </Text>
            <TextInput
              style={styles.themeInput}
              value={themeEdit?.value ?? ''}
              onChangeText={(v) =>
                setThemeEdit((prev) => (prev ? { ...prev, value: v } : prev))
              }
              placeholder={t('fieldService.monthTheme.placeholder')}
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={2000}
              autoFocus
            />
            <View style={styles.themeActions}>
              <Pressable
                style={styles.themeCancel}
                onPress={() => setThemeEdit(null)}
              >
                <Text style={styles.themeCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={styles.themeSave}
                onPress={saveTheme}
                disabled={themeM.isPending}
              >
                <Text style={styles.themeSaveText}>
                  {t('fieldService.form.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Dialog
        visible={pdfOpen}
        title={t('fieldService.pdf.title')}
        icon="print-outline"
        iconTint="#16a34a"
        iconBg="#dcfce7"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('fieldService.pdf.title')}
        onConfirm={exportPdf}
        onCancel={() => setPdfOpen(false)}
      >
        <Text style={pdfStyles.label}>{t('fieldService.pdf.startMonth')}</Text>
        <View style={pdfStyles.stepRow}>
          <Pressable
            style={pdfStyles.stepBtn}
            onPress={() =>
              setPdfStart((v) =>
                dayjs(`${v}-01`).subtract(1, 'month').format('YYYY-MM'),
              )
            }
          >
            <Ionicons name="chevron-back" size={18} color="#0369a1" />
          </Pressable>
          <Text style={pdfStyles.stepValue}>
            {dayjs(`${pdfStart}-01`)
              .toDate()
              .toLocaleDateString(i18n.language, {
                month: 'long',
                year: 'numeric',
              })}
          </Text>
          <Pressable
            style={pdfStyles.stepBtn}
            onPress={() =>
              setPdfStart((v) =>
                dayjs(`${v}-01`).add(1, 'month').format('YYYY-MM'),
              )
            }
          >
            <Ionicons name="chevron-forward" size={18} color="#0369a1" />
          </Pressable>
        </View>
        <Text style={pdfStyles.label}>{t('fieldService.pdf.monthsCount')}</Text>
        <View style={pdfStyles.chipRow}>
          {[1, 2, 3, 6].map((n) => (
            <Pressable
              key={n}
              style={[pdfStyles.chip, pdfMonths === n && pdfStyles.chipActive]}
              onPress={() => setPdfMonths(n)}
            >
              <Text
                style={[
                  pdfStyles.chipText,
                  pdfMonths === n && pdfStyles.chipTextActive,
                ]}
              >
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
      </Dialog>

      <FieldServicePrepareSheet
        visible={prepareOpen}
        onClose={() => setPrepareOpen(false)}
        // The month after the one on screen when that one is already
        // being lived; the overseer prepares ahead, not behind.
        initialMonthKey={
          activeMonthKey <= currentMonthKey
            ? dayjs(`${currentMonthKey}-01`).add(1, 'month').format('YYYY-MM')
            : activeMonthKey
        }
        onEditTemplate={() => setGenOpen(true)}
      />
      {/* The rules themselves, until the new template window replaces this
          (stage 3c): no month here, no «Сгенерировать». */}
      <FieldServiceGenerateModal
        visible={genOpen}
        onClose={() => setGenOpen(false)}
        templateOnly
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingRight: 8,
  },
  monthBarScroll: { flex: 1 },
  monthBarInner: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  monthChipCurrent: { backgroundColor: '#0ea5e9' },
  monthChipText: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#475569' },
  monthChipTextCurrent: { color: '#fff' },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#0369a1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  planBtnText: { fontSize: 13, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0369a1' },
  monthSection: { paddingHorizontal: 16, paddingTop: 16 },
  monthTitle: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
    color: '#0f172a',
  },
  monthTitleCurrent: { color: '#0369a1' },
  themeRow: { paddingVertical: 4, marginBottom: 6 },
  themeLabel: { fontSize: 13.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  themeText: { color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  themeAddText: { color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  draftCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f0c98a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 4,
  },
  draftTitle: { fontSize: 16, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold', color: '#0f172a' },
  draftLine: { fontSize: 14, color: '#334155', fontFamily: 'Manrope_500Medium' },
  draftLineWarn: { color: '#a14a00', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  draftHint: { fontSize: 13, color: '#64748b', marginTop: 4, fontFamily: 'Manrope_500Medium' },
  draftActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  draftSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#0369a1',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  draftSecondaryText: { fontSize: 14, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0369a1' },
  draftPrimary: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#0369a1',
  },
  draftPrimaryText: { fontSize: 14, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#ffffff' },
  emptyMonth: {
    fontSize: 14,
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  dayCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 10,
  },
  dayHead: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  dayHeadText: { fontSize: 13.5, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#475569' },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f6',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  rowLast: { borderBottomWidth: 0 },
  rowMine: {},
  rowPress: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rowTime: {
    width: 46,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
    color: '#0f172a',
    paddingTop: 1,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  rowWho: { fontSize: 13.5, color: '#334155', fontFamily: 'Manrope_500Medium' },
  rowWhoEmpty: { color: '#a14a00', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  rowMuted: { fontSize: 13, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  rowFaint: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic' },
  visitBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#fdf0d9',
  },
  visitBadgeText: { fontSize: 11.5, color: '#7a4a06', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  draftBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  draftBadgeText: { fontSize: 11.5, color: '#475569', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#94a3b8',
    marginTop: 2,
    marginBottom: 6,
  },
  addBtnText: { fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0369a1' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  themeCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  themeCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
    color: '#0f172a',
    marginBottom: 10,
  },
  themeInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  themeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  themeCancel: { paddingHorizontal: 16, paddingVertical: 10 },
  themeCancelText: { fontSize: 14, color: '#64748b', fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  themeSave: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
  },
  themeSaveText: { fontSize: 14, color: '#fff', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
});

const pdfStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 22,
    width: '100%',
    maxWidth: 380,
  },
  title: { fontSize: 17, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold', color: '#0f172a', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#64748b', marginTop: 8 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { fontSize: 15, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  chip: {
    minWidth: 44,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  chipActive: { backgroundColor: '#0ea5e9' },
  chipText: { fontSize: 14, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#475569' },
  chipTextActive: { color: '#fff' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#475569' },
  download: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadText: { fontSize: 15, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#fff' },
});
