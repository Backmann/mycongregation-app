/**
 * «Что происходит» and a territory's journal (17 November 2026; mockup
 * «Участки — история, передача, журнал», boards 5 and 6): each step the
 * server names (`kind`) becomes one line a territory servant reads —
 * «Передан: Петренко С. → Мельник О.», «с 16 нояб., срок 2 февр.».
 *
 * Pure: the words come through `t`, the dates through `date`, so a script
 * holds it to every shape the server ever wrote
 * (scripts/check-territory-history.mjs). The older journal entries carry
 * less — no holder, no dates — and still read as a line, never as a code
 * name or nothing.
 */
import { territoryJournalLines } from './territory-journal';

export interface HistoryLine {
  /** What happened, with whom: «Передан: Петренко С. → Мельник О.». */
  title: string;
  /** The days and the details: «с 16 нояб., срок 2 февр.». */
  meta: string;
}

type T = (key: string, opts?: Record<string, unknown>) => string;

export interface HistoryInput {
  kind: string;
  entityType: string;
  holder: string | null;
  fromHolder: string | null;
  forGroup: string | null;
  detail: Record<string, unknown> | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** «Гр. 2 · Кузьмин В.» — as the S-13 writes a group's territory. */
function who(holder: string | null, group: string | null, t: T): string {
  const name = holder ?? t('territories.history.someone');
  return group ? `${group} · ${name}` : name;
}

export function historyLine(
  item: HistoryInput,
  t: T,
  date: (iso: string) => string,
): HistoryLine {
  const k = (key: string, opts?: Record<string, unknown>) => t(`territories.history.${key}`, opts);
  const d = item.detail ?? {};
  const day = (v: unknown) => (str(v) ? date(v as string) : null);
  const holder = who(item.holder, item.forGroup, t);
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(' · ');

  /** «3 янв. → 11 мая · пройден» / «… → на руках». */
  const span = (f: Record<string, unknown>) => {
    const from = day(f.assignedOn);
    const end = day(f.completedOn) ?? day(f.returnedOn);
    const how = f.completedOn
      ? k('endWorked')
      : f.returnedOn
        ? k('endReturned')
        : k('endHeld');
    if (!from) return how;
    return `${from} → ${end ?? how}${end ? ` · ${how}` : ''}`;
  };

  switch (item.kind) {
    case 'given':
      return {
        title: k('given', { who: holder }),
        meta: join(day(d.dueOn) ? k('due', { date: day(d.dueOn) }) : null),
      };
    case 'transferred':
      return {
        title: k('transferred', {
          from: item.fromHolder ?? k('someone'),
          to: holder,
        }),
        meta: join(
          day(d.on) ?? day(d.assignedOn) ? k('since', { date: day(d.on) ?? day(d.assignedOn) }) : null,
          day(d.dueOn) ? k('due', { date: day(d.dueOn) }) : null,
        ),
      };
    case 'past':
      return { title: k('past', { who: holder }), meta: span(d) };
    case 'worked':
      return {
        title: k('worked'),
        meta: join(k('heldBy', { who: holder }), day(d.completedOn)),
      };
    case 'returned':
      return {
        title: k('returned'),
        meta: join(k('heldBy', { who: holder }), day(d.returnedOn)),
      };
    case 'campaign': {
      const list = Array.isArray(d.campaign) ? d.campaign.filter((x) => typeof x === 'string') : [];
      return {
        title: k('campaign', { count: list.length }),
        meta: join(list.join(', ') || null, day(d.workedOn)),
      };
    }
    case 'extended':
      return {
        title: k('extended', { date: day(d.dueOn) ?? '…' }),
        meta: k('heldBy', { who: holder }),
      };
    case 'removed':
      return { title: k('removed', { who: holder }), meta: span(d) };
    case 'corrected':
      return corrected(item, t, date);
    default: {
      // The congregation's own boundary.
      if (item.entityType === 'territory_boundary') return { title: k('boundary'), meta: '' };
      // The re-cutting, where it reached the territories.
      const list = (v: unknown) =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
      if (d.recut === 'held') return { title: k('recutHeld'), meta: '' };
      if (d.recut === 'released') return { title: k('recutReleased'), meta: '' };
      if (d.recut === 'unapplied') return { title: k('recutUnapplied'), meta: str(d.number) ?? '' };
      if (d.recut === 'applied') {
        return {
          title: d.kind === 'join' ? k('recutJoined') : k('recutCut'),
          meta: join(
            list(d.made).length ? k('recutMade', { list: list(d.made).join(', ') }) : null,
            list(d.archived).length ? k('recutArchived', { list: list(d.archived).join(', ') }) : null,
          ),
        };
      }
      // The territory itself: the journal's own words for its facts.
      const lines =
        territoryJournalLines(item.entityType, item.detail, t, date)?.filter(
          // The number is already on the left of the line.
          (l) => l.label !== t('journal.territory.territory'),
        ) ?? [];
      if (!lines.length) return { title: k('changed'), meta: '' };
      const [first, ...rest] = lines;
      const said = (l: (typeof lines)[number]) =>
        l.was ? `${l.label}: ${l.was} → ${l.now ?? ''}` : `${l.label}: ${l.now ?? ''}`;
      return { title: said(first), meta: rest.map(said).join(' · ') };
    }
  }
}

/** «Исправлена запись: Гр. 2 · Кузьмин В.» — and what moved, was → now. */
function corrected(item: HistoryInput, t: T, date: (iso: string) => string): HistoryLine {
  const k = (key: string, opts?: Record<string, unknown>) => t(`territories.history.${key}`, opts);
  const d = item.detail ?? {};
  const before = (d.before ?? null) as Record<string, unknown> | null;
  const after = (d.after ?? null) as Record<string, unknown> | null;
  const changes: string[] = [];
  const day = (v: unknown) => (str(v) ? date(v as string) : k('none'));
  // The new shape: the whole line before and after.
  if (before && after && 'holder' in after) {
    const wasWho = who(str(before.holder), str(before.forGroup), t);
    const nowWho = who(str(after.holder), str(after.forGroup), t);
    if (wasWho !== nowWho) changes.push(k('changeWho', { was: wasWho, now: nowWho }));
    const field = (f: string, label: string) => {
      if ((before[f] ?? null) !== (after[f] ?? null)) {
        changes.push(`${k(label)} ${day(before[f])} → ${day(after[f])}`);
      }
    };
    field('assignedOn', 'fieldGiven');
    field('dueOn', 'fieldDue');
    field('completedOn', 'fieldWorked');
    field('returnedOn', 'fieldReturned');
    if (
      after.completedOn &&
      before.method &&
      after.method &&
      before.method !== after.method
    ) {
      changes.push(
        `${t(`territories.method.${String(before.method)}`)} → ${t(`territories.method.${String(after.method)}`)}`,
      );
    }
    return {
      title: k('corrected', { who: nowWho }),
      meta: changes.join(' · ') || k('changedNothing'),
    };
  }
  // The old shape (until 17 November 2026): what was sent, no holder.
  if (after) {
    if (after.reopen === true) changes.push(k('reopened'));
    for (const [f, label] of [
      ['assignedOn', 'fieldGiven'],
      ['dueOn', 'fieldDue'],
      ['completedOn', 'fieldWorked'],
      ['returnedOn', 'fieldReturned'],
    ] as const) {
      if (str(after[f])) changes.push(`${k(label)} ${day(after[f])}`);
    }
  }
  return {
    title: k('corrected', { who: who(item.holder, item.forGroup, t) }),
    meta: changes.join(' · '),
  };
}

/** Which day a feed entry falls under: «Сегодня», «Вчера», or the date. */
export function dayHeading(
  at: string,
  today: Date,
  t: T,
  date: (iso: string) => string,
): string {
  const local = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = local(new Date(at));
  const now = local(today);
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (day === now) return t('territories.history.today');
  if (day === local(y)) return t('territories.history.yesterday');
  return date(day);
}
