import { Linking, Platform } from 'react-native';

/**
 * «В мой календарь» for a congregation event (28 September).
 *
 * No calendar module and no file module in the build: adding one would change
 * the app's fingerprint and the installed phones would stop taking updates.
 * So the two ways that need neither:
 *   - in the browser, a small .ics file — Apple Calendar, Outlook and Google
 *     all open it;
 *   - on the phone, the calendar's own «new event» address, which Android
 *     hands to the Google Calendar app (or the browser).
 *
 * Times are written as local wall-clock times, with no zone: the event is at
 * 19:00 where the congregation meets, and that is what the person's calendar
 * should show. A day without a time, or several days, is an all-day entry.
 */
export interface CalendarEntry {
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  /** YYYY-MM-DD, inclusive; null for one day. */
  endDate: string | null;
  /** HH:MM, or null for all day. */
  time: string | null;
  timeEnd: string | null;
  location: string | null;
  details: string | null;
}

const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
const nextDay = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const hm = (t: string) => t.slice(0, 5).replace(':', '');
/** Two hours when no end is given — the length of a meeting. */
const plusTwoHours = (t: string) => {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  const end = Math.min(23 * 60 + 59, h * 60 + m + 120);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(end / 60))}${p(end % 60)}`;
};

/** Start and end as the calendar formats want them. */
export function calendarSpan(e: CalendarEntry): {
  allDay: boolean;
  start: string;
  end: string;
} {
  const multi = !!e.endDate && e.endDate.slice(0, 10) !== e.date.slice(0, 10);
  if (!e.time || multi) {
    // All-day: the end is exclusive — the day after the last one.
    return {
      allDay: true,
      start: ymd(e.date),
      end: ymd(nextDay(e.endDate ?? e.date)),
    };
  }
  const end =
    e.timeEnd && hm(e.timeEnd) > hm(e.time) ? hm(e.timeEnd) : plusTwoHours(e.time);
  return {
    allDay: false,
    start: `${ymd(e.date)}T${hm(e.time)}00`,
    end: `${ymd(e.date)}T${end}00`,
  };
}

const icsText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** The .ics file's text (RFC 5545, one event). */
export function toIcs(e: CalendarEntry, uid: string): string {
  const span = calendarSpan(e);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//mycongregation.org//events//RU',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}@mycongregation.org`,
    `DTSTAMP:${stamp}`,
    span.allDay ? `DTSTART;VALUE=DATE:${span.start}` : `DTSTART:${span.start}`,
    span.allDay ? `DTEND;VALUE=DATE:${span.end}` : `DTEND:${span.end}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.details ? [`DESCRIPTION:${icsText(e.details)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Google Calendar's «new event» address with everything filled in. */
export function googleCalendarUrl(e: CalendarEntry): string {
  const span = calendarSpan(e);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${span.start}/${span.end}`,
  });
  if (e.location) q.set('location', e.location);
  if (e.details) q.set('details', e.details);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Put the event into the person's calendar, the way this platform can. */
export async function addToCalendar(e: CalendarEntry, uid: string): Promise<void> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([toIcs(e, uid)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // A Latin name: some browsers drop a name in Cyrillic and save the file
    // as «download», without the .ics the calendars open by.
    a.download = `mycongregation-${e.date.slice(0, 10)}.ics`;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Kept a moment: removed at once, some browsers drop the file's name.
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
    return;
  }
  await Linking.openURL(googleCalendarUrl(e));
}
