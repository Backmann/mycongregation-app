/**
 * READY MESSAGES of the talk coordinator (Lionel, 25 October 2026).
 *
 * The texts were agreed with him word for word: to the guest when he is
 * invited, to the guest two or three days before, and to whoever brings the
 * guest's lunch bag. A line whose facts are not in the visit is left out — no
 * «Речь №—», no empty address. Nothing is marked by sending: these are only
 * the words, ready to go out by WhatsApp, a copy or the phone's own sharing.
 *
 * The words live in locales/*.json under talkCoordinator.msgText, like every
 * other word of the app; this file only decides which lines a visit has and
 * in what order. It takes the translating function as an argument, so the
 * texts can be checked without a screen (scripts/check-talk-messages.mjs).
 */

export type Lang = 'ru' | 'de' | 'en';
export type Tr = (key: string, vars?: Record<string, string | number>) => string;

export interface VisitFacts {
  /** The meeting's day, `YYYY-MM-DD`. */
  date: string;
  /** Today, `YYYY-MM-DD` — «в это воскресенье» for the days just before. */
  today: string;
  time: string | null;
  address: string | null;
  guestFirstName: string | null;
  guestFullName: string | null;
  guestCongregation: string | null;
  talkNumber: number | null;
  talkTitle: string | null;
  specialTheme: string | null;
  openingSong: number | null;
  /** The Watchtower study's songs that day, when imported. */
  studySongs: number[];
  /** Somebody brings the lunch bag. */
  lunchArranged: boolean;
  /** The sender's first name, and whether he signs as the coordinator. */
  senderName: string | null;
  senderIsCoordinator: boolean;
}


function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dow = ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1; // 1 = Monday
  return { y, m, d, dow };
}
function daysBetween(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  return Math.round((Date.UTC(y.y, y.m - 1, y.d) - Date.UTC(x.y, x.m - 1, x.d)) / 86_400_000);
}
/** «в воскресенье, 8 ноября»; with `soon` — «в это воскресенье, 8 ноября». */
function when(tr: Tr, iso: string, soon: boolean): string {
  const { m, d, dow } = parts(iso);
  return tr(`talkCoordinator.msgText.date`, {
    day: tr(soon ? `talkCoordinator.msgText.thisDay.${dow}` : `talkCoordinator.msgText.onDay.${dow}`),
    d,
    month: tr(`talkCoordinator.msgText.month.${m}`),
  });
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
function list(tr: Tr, nums: number[]): string {
  return nums.length === 1
    ? String(nums[0])
    : `${nums.slice(0, -1).join(', ')} ${tr(`talkCoordinator.msgText.and`)} ${nums[nums.length - 1]}`;
}
const lines = (xs: (string | null | false)[]) => xs.filter(Boolean).join('\n');

function talkLine(tr: Tr, f: VisitFacts): string | null {
  if (f.specialTheme) return tr(`talkCoordinator.msgText.talkSpecial`, { theme: f.specialTheme });
  if (f.talkNumber && f.talkTitle) return tr(`talkCoordinator.msgText.talkNumber`, { n: f.talkNumber, title: f.talkTitle });
  return null;
}
function signature(tr: Tr, f: VisitFacts): string | null {
  if (!f.senderName) return null;
  return f.senderIsCoordinator ? tr(`talkCoordinator.msgText.signCoordinator`, { name: f.senderName }) : f.senderName;
}
function hello(tr: Tr, name: string | null, sister = false): string {
  const who = sister ? 'Sister' : 'Brother';
  return name ? tr(`talkCoordinator.msgText.hello${who}`, { name }) : tr(`talkCoordinator.msgText.hello${who}NoName`);
}

/** To the guest, when he is invited. */
export function guestInvitation(tr: Tr, f: VisitFacts): string {
  const time = hhmm(f.time);
  const repeats = f.openingSong !== null && f.studySongs.includes(f.openingSong);
  const start =
    time && f.address
      ? tr(`talkCoordinator.msgText.startAddress`, { time, address: f.address })
      : time
        ? tr(`talkCoordinator.msgText.startOnly`, { time })
        : f.address
          ? tr(`talkCoordinator.msgText.addressOnly`, { address: f.address })
          : null;
  const song =
    f.openingSong !== null && !repeats
      ? tr(`talkCoordinator.msgText.songKnown`, { n: f.openingSong })
      : `${repeats ? tr(`talkCoordinator.msgText.songRepeat`, { n: f.openingSong! }) : ''}${
          f.studySongs.length > 0
            ? tr(`talkCoordinator.msgText.songAskAvoid`, { list: list(tr, f.studySongs) })
            : tr(`talkCoordinator.msgText.songAsk`)
        }`;
  return lines([
    hello(tr, f.guestFirstName?.trim() || null),
    tr(`talkCoordinator.msgText.waitTalk`, { when: when(tr, f.date, false) }),
    start,
    talkLine(tr, f),
    song,
    f.lunchArranged && tr(`talkCoordinator.msgText.lunchReady`),
    tr(`talkCoordinator.msgText.ifChanges`),
    signature(tr, f),
  ]);
}

/** To the guest, two or three days before. */
export function guestReminder(tr: Tr, f: VisitFacts): string {
  const time = hhmm(f.time);
  const first = f.guestFirstName?.trim() || null;
  const days = daysBetween(f.today, f.date);
  const talk = f.specialTheme
    ? tr(`talkCoordinator.msgText.remindTalkSpecial`, { theme: f.specialTheme })
    : f.talkNumber
      ? tr(`talkCoordinator.msgText.remindTalkNumber`, { n: f.talkNumber })
      : tr(`talkCoordinator.msgText.remindTalkNone`);
  return lines([
    tr(`talkCoordinator.msgText.remindLine`, {
      who: first ? tr(`talkCoordinator.msgText.remindWho`, { name: first }) : tr(`talkCoordinator.msgText.remindWhoNoName`),
      when: when(tr, f.date, days >= 0 && days <= 6),
      at: time ? tr(`talkCoordinator.msgText.remindAt`, { time }) : tr(`talkCoordinator.msgText.remindNoTime`),
      talk,
    }),
    f.address && tr(`talkCoordinator.msgText.remindAddress`, { address: f.address }),
    tr(`talkCoordinator.msgText.remindBye`),
    signature(tr, f),
  ]);
}

/** To whoever brings the guest's lunch bag. */
export function lunchBagMessage(
  tr: Tr,
  f: VisitFacts,
  bringer: { firstName: string | null; sister: boolean },
): string {
  const time = hhmm(f.time);
  const guest = f.guestFullName?.trim() || null;
  return lines([
    hello(tr, bringer.firstName?.trim() || null, bringer.sister),
    tr(`talkCoordinator.msgText.lunchLine`, {
      when: cap(when(tr, f.date, false)),
      guest: guest ? tr(`talkCoordinator.msgText.lunchGuest`, { name: guest }) : tr(`talkCoordinator.msgText.lunchGuestNone`),
      from: f.guestCongregation ? tr(`talkCoordinator.msgText.lunchFrom`, { cong: f.guestCongregation }) : '',
      by: time ? tr(`talkCoordinator.msgText.lunchBy`, { time }) : '',
    }),
    tr(`talkCoordinator.msgText.thanks`),
    f.senderName,
  ]);
}

/**
 * A number WhatsApp can open: digits only, with the country code. A number
 * written the German way («0151 …») takes the congregation's code.
 */
export function whatsappNumber(phone: string | null | undefined, countryCode = '49'): string | null {
  if (!phone) return null;
  const raw = phone.trim();
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return countryCode + digits.slice(1);
  return digits;
}
