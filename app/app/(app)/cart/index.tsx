import { useCallback, useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '../../../lib/permissions';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import {
  attendanceApi,
  auxiliaryPioneersApi,
  cartWeeksApi,
  fieldServiceApi,
  serviceOverseerApi,
  serviceReportsApi,
  specialEventsApi,
} from '../../../lib/api';
import { addDays, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { serviceLines, type ServiceLine } from '../../../lib/service-lines';
import { useReportCollection } from '../../../components/ReportCollectionCard';
import { DoorList, type Door, type DoorSection } from '../../../components/DoorList';

/**
 * The contents of «Служение» — every door into the ministry's side of the
 * congregation, drawn as «Собрание» is (4 October 2026).
 *
 * WHO SEES A DOOR is not decided here: DoorList draws each for whoever its
 * screen lets in (lib/screen-access), so a door and its screen cannot
 * disagree.
 * «Школа пионеров» left this screen: it stands in «Собрание», under the body
 * of elders, and two doors onto one screen were one too many (Lionel,
 * 4 October).
 *
 * Under each door stands what its own screen would answer first. Every line
 * is read from the request that screen makes — the same query key, so the
 * two share one answer and cannot disagree — and lib/service-lines decides
 * the wording. Until an answer arrives, or if it fails, the row keeps its
 * plain description.
 *
 * Elders and administrators see sections; everyone else a few rows with no
 * headings, their own report first.
 */
export default function ServiceHubScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  const { myPublisher, myPublisherId } = useMyPublisher();

  // The day is read once per mount: the tab is remounted often enough, and a
  // line that changes under the finger is worse than one a minute old.
  const { today, nowHM, monday, nextMonday, month } = useMemo(() => {
    const now = new Date();
    const mon = startOfWeekMonday(now);
    const p = (n: number) => String(n).padStart(2, '0');
    const iso = formatDateISO(now);
    return {
      today: iso,
      nowHM: `${p(now.getHours())}:${p(now.getMinutes())}`,
      monday: mon,
      nextMonday: addDays(mon, 7),
      month: `${iso.slice(0, 7)}-01`,
    };
  }, []);
  const mon0 = formatDateISO(monday);
  const mon1 = formatDateISO(nextMonday);

  // The same keys as the screens behind the doors (and as Home), so nothing
  // is asked twice.
  const standingQ = useQuery({
    queryKey: ['reports', 'my-standing'],
    queryFn: () => serviceReportsApi.myStanding(),
    staleTime: 5 * 60 * 1000,
  });
  const collection = useReportCollection();
  const attendanceQ = useQuery({
    queryKey: ['attendance', 'pending'],
    queryFn: () => attendanceApi.pending(),
    enabled: perms.canViewAttendance,
    staleTime: 60 * 1000,
  });
  const fieldQ = useQuery({
    queryKey: ['field-service', 'range', mon0],
    queryFn: () =>
      fieldServiceApi.list({ weekStart: mon0, weekEnd: formatDateISO(addDays(monday, 21)) }),
    staleTime: 60 * 1000,
  });
  const cartQs = useQueries({
    queries: [mon0, mon1].map((w) => ({
      queryKey: ['cart-week', w],
      queryFn: () => cartWeeksApi.getWeek(w),
      staleTime: 60 * 1000,
    })),
  });
  const visitsQ = useQuery({
    queryKey: ['service-overseer', 'group-visits'],
    queryFn: () => serviceOverseerApi.groupVisits(),
    staleTime: 60 * 1000,
  });
  const eventsQ = useQuery({
    queryKey: ['special-events', 'home'],
    queryFn: () => specialEventsApi.list(),
    enabled: perms.canViewCoSchedule,
    staleTime: 60 * 1000,
  });
  // Auxiliary pioneers: one row, two screens. Whoever keeps the list is led
  // to it and reads its month; everybody else is told who serves this month,
  // by name, and is led to that.
  const keepsAux = perms.canManageAuxiliaryPioneers;
  const auxQ = useQuery({
    queryKey: ['aux-pioneers', 'month', month],
    queryFn: () => auxiliaryPioneersApi.listForMonth(month),
    enabled: keepsAux,
    staleTime: 60 * 1000,
  });
  const servingQ = useQuery({
    queryKey: ['aux-pioneers', 'serving-now'],
    queryFn: () => auxiliaryPioneersApi.servingNow(),
    enabled: perms.loaded && !keepsAux,
    staleTime: 60 * 1000,
  });
  const servingCount = servingQ.data ? servingQ.data.people.length : null;

  // Back from a screen where something was just changed, the lines say so:
  // every answer is marked stale whenever the tab comes to the front, and
  // those in use here are asked again.
  const qc = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      for (const queryKey of [
        ['reports', 'my-standing'],
        ['service-reports', 'collection'],
        ['attendance', 'pending'],
        ['field-service', 'range', mon0],
        ['cart-week', mon0],
        ['cart-week', mon1],
        ['service-overseer', 'group-visits'],
        ['special-events', 'home'],
        ['aux-pioneers', 'month', month],
        ['aux-pioneers', 'serving-now'],
      ]) {
        void qc.invalidateQueries({ queryKey });
      }
    }, [qc, mon0, mon1, month]),
  );

  // Both cart weeks answered (null is an answer: no week set up) — or none.
  const cartWeeks = cartQs.every((q) => q.isSuccess) ? cartQs.map((q) => q.data ?? null) : null;

  const lines: Record<string, ServiceLine> = serviceLines(
    {
      today,
      nowHM,
      me: myPublisherId,
      myGroupId: myPublisher?.serviceGroupId ?? null,
      standing: standingQ.data ?? null,
      collection,
      attendance: attendanceQ.data ?? null,
      fieldMeetings: fieldQ.data ?? null,
      cartWeeks,
      groupVisits: visitsQ.data ?? null,
      events: eventsQ.data ?? null,
      auxCount: keepsAux ? (auxQ.data ? auxQ.data.rows.length : null) : servingCount,
    },
    {
      recordsAttendance: perms.canRecordAttendance,
      plansVisits: perms.canEditFieldServiceMeetings,
    },
    t as never,
    i18n.language,
  );

  const reports: Door = {
    key: 'reports',
    title: t('service.reports'),
    subtitle: t('service.reportsSubtitle'),
    href: '/service-reports',
  };
  const fieldService: Door = {
    key: 'fieldService',
    title: t('fieldService.title'),
    subtitle: t('fieldService.hubSubtitle'),
    href: '/cart/field-service',
  };
  const cart: Door = {
    key: 'cart',
    title: t('service.publicWitnessing'),
    subtitle: t('service.publicWitnessingSubtitle'),
    href: '/cart/witnessing',
  };
  // Open to everyone, as the screen is (24 September): a group sees in
  // advance that the service overseer is coming.
  const serviceOverseer: Door = {
    key: 'serviceOverseer',
    title: t('serviceOverseer.title'),
    subtitle: t('serviceOverseer.menuSubtitle'),
    href: '/cart/service-overseer',
  };
  // The two that came out of «Отчёты» (they stay there too).
  const summary: Door[] = [
    {
      key: 'summary',
      title: t('reports.summary.title'),
      subtitle: t('serviceHub.sub.summary'),
      href: '/service-reports/summary',
    },
  ];
  const attendance: Door[] = [
    {
      key: 'attendance',
      title: t('attendance.pageTitle'),
      subtitle: t('serviceHub.sub.attendance'),
      href: '/service-reports/attendance',
    },
  ];
  const coSchedule: Door[] = [
    {
      key: 'coSchedule',
      title: t('service.coSchedule'),
      subtitle: t('service.coScheduleSubtitle'),
      href: '/cart/co-schedule',
    },
  ];
  // One row under one name. For whoever keeps the list it opens the working
  // list (DoorList draws that door for them alone). For everybody else it
  // opens this month's names — and is not drawn at all in a month when
  // nobody serves, or before the answer has come: a row that says «никто»
  // would only point at an absence.
  const auxPioneers: Door[] = keepsAux
    ? [
        {
          key: 'auxPioneers',
          title: t('auxPioneer.title'),
          subtitle: t('auxPioneer.menuSubtitle'),
          href: '/cart/auxiliary-pioneers',
        },
      ]
    : servingCount !== null && servingCount > 0
      ? [
          {
            key: 'auxPioneers',
            title: t('auxPioneer.title'),
            subtitle: t('auxPioneer.menuSubtitle'),
            href: '/cart/auxiliary-pioneers-month',
          },
        ]
      : [];

  const sections: DoorSection[] =
    perms.isElder || perms.isAdmin
      ? [
          { key: 'preaching', label: t('serviceHub.sections.preaching'), doors: [fieldService, cart] },
          { key: 'reports', label: t('serviceHub.sections.reports'), doors: [reports, ...summary, ...attendance] },
          { key: 'visits', label: t('serviceHub.sections.visits'), doors: [serviceOverseer, ...coSchedule] },
          { key: 'pioneers', label: t('serviceHub.sections.pioneers'), doors: auxPioneers },
        ]
      : [
          {
            key: 'mine',
            label: null,
            // His own report first; then where he goes; then what a
            // responsibility of his adds, if he holds one.
            doors: [reports, fieldService, cart, serviceOverseer, ...attendance, ...summary, ...coSchedule, ...auxPioneers],
          },
        ];

  return <DoorList sections={sections} lines={lines} />;
}
