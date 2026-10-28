import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  meetingSettingsApi,
  publisherActivityApi,
  specialEventsApi,
  type ActivityItem,
} from './api';
import { addWeeks, formatDateISO, startOfWeekMonday } from './dates';
import { effectiveVersionFor } from './meeting-schedule';
import { weekRules } from './week-rules';
import { activityItemLabel } from './activity';

/**
 * WHAT A PERSON IS GIVEN ON THE DAYS HE IS AWAY (28 October 2026).
 *
 * The pickers warn about an absence when somebody is put on a part. Nothing
 * warned the other way round: an absence entered AFTER the part was given
 * was seen by nobody — on the stand a brother away 9–16 November chaired the
 * meeting of the 11th. This answers, for any set of periods, which parts of
 * the programme and which duties at the meetings fall on their days.
 *
 * The day of each item is the week rules' answer (a meeting moved by the
 * circuit overseer's visit on its moved day, the Memorial on its date), as on
 * the publisher's card. Field-service meetings and the carts are not in the
 * activity answer and are not checked here.
 *
 * Only the days still ahead are looked at, up to `HORIZON_WEEKS`: what has
 * been can no longer be helped, and nothing is planned much further.
 */

export interface Clash {
  /** YYYY-MM-DD — the day of the meeting. */
  date: string;
  label: string;
  eventType: string;
}

export interface PeriodToCheck {
  key: string;
  publisherId: string;
  startDate: string;
  endDate: string | null;
}

const HORIZON_WEEKS = 16;

export function useAbsenceClashes(periods: PeriodToCheck[], enabled = true): {
  clashes: Map<string, Clash[]>;
  ready: boolean;
} {
  const today = formatDateISO(new Date());
  const monday = startOfWeekMonday(new Date());
  // GET /publisher-activity looks BACK from the week it is given.
  const until = formatDateISO(addWeeks(monday, HORIZON_WEEKS));
  const relevant = periods.filter((p) => (p.endDate ?? p.startDate) >= today);
  const on = enabled && relevant.length > 0;

  const activityQ = useQuery({
    queryKey: ['publisher-activity', until, HORIZON_WEEKS + 1],
    queryFn: () => publisherActivityApi.getActivity({ weekStart: until, weeks: HORIZON_WEEKS + 1 }),
    enabled: on,
    staleTime: 60 * 1000,
  });
  const settingsQ = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    enabled: on,
  });
  const eventsQ = useQuery({
    queryKey: ['special-events', 'all'],
    queryFn: () => specialEventsApi.list({ all: true }),
    enabled: on,
  });

  const clashes = useMemo(() => {
    const out = new Map<string, Clash[]>();
    if (!activityQ.data || !settingsQ.data || !eventsQ.data) return out;
    const byPerson = new Map(activityQ.data.map((a) => [a.publisherId, a.items]));
    const dayOf = (i: ActivityItem): string | null => {
      const rules = weekRules({
        weekStartISO: i.weekStartDate,
        version: effectiveVersionFor(settingsQ.data!.versions, i.weekStartDate),
        events: eventsQ.data!,
      });
      if (i.eventType === 'memorial') return rules.memorial?.date ?? null;
      if (i.eventType === 'midweek' || i.eventType === 'weekend') return rules.dateOf(i.eventType);
      return null;
    };
    for (const p of relevant) {
      const end = p.endDate ?? p.startDate;
      const from = p.startDate > today ? p.startDate : today;
      const found: Clash[] = [];
      for (const item of byPerson.get(p.publisherId) ?? []) {
        const day = dayOf(item);
        if (!day || day < from || day > end) continue;
        found.push({ date: day, label: activityItemLabel(item), eventType: item.eventType });
      }
      if (found.length) out.set(p.key, found.sort((a, b) => a.date.localeCompare(b.date)));
    }
    return out;
    // `relevant` is rebuilt every render; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityQ.data, settingsQ.data, eventsQ.data, JSON.stringify(relevant), today]);

  return { clashes, ready: !on || (!!activityQ.data && !!settingsQ.data && !!eventsQ.data) };
}

/** «ср 11 нояб. — Председатель встречи, Чтец» — one line per day. */
export function clashLines(clashes: Clash[], lang: string): string[] {
  const byDay = new Map<string, string[]>();
  for (const c of clashes) byDay.set(c.date, [...(byDay.get(c.date) ?? []), c.label]);
  return [...byDay.entries()].map(([day, labels]) => {
    const d = new Date(`${day}T00:00:00`).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });
    return `${d.replace(',', '')} — ${labels.join(', ')}`;
  });
}
