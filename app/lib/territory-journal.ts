/**
 * The journal's lines for the territory section (12 November 2026).
 *
 * The server records a territory's changes as facts — `{outline: 'edit',
 * with: […], leaving: 3}`, `{split: true, made: 'A06'}`, the card's
 * `{before: {…}, after: {…}}` — and the journal printed their code names
 * («outline», «leaving») or, for the card, nothing at all. Here each fact
 * becomes a line a territory servant reads: «Граница — изменена», «Номер:
 * A01 → A10». Pure: the words come through `t`, so a script can check it
 * (scripts/check-territory-journal.mjs).
 */

export interface JournalLine {
  label: string;
  was: string | null;
  now: string | null;
}

type T = (key: string, opts?: Record<string, unknown>) => string;

const CARD_FIELDS = ['number', 'locality', 'kind'] as const;
const NO_CALL_FIELDS = ['address', 'surname', 'notedOn', 'territory'] as const;

export function territoryJournalLines(
  entityType: string,
  detail: Record<string, unknown> | null,
  t: T,
  date: (iso: string) => string,
): JournalLine[] | null {
  if (!detail) return null;
  const k = (key: string, opts?: Record<string, unknown>) => t(`journal.territory.${key}`, opts);
  const out: JournalLine[] = [];
  const line = (label: string, now: string | null, was: string | null = null) =>
    out.push({ label, was, now });
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

  if (entityType === 'territory_no_call') {
    if (str(detail.territory)) line(k('territory'), str(detail.territory));
    if (Array.isArray(detail.changed) && detail.changed.length) {
      line(
        k('changed'),
        detail.changed
          .filter((f): f is string => typeof f === 'string')
          .map((f) =>
            (NO_CALL_FIELDS as readonly string[]).includes(f) ? k(`noCallField.${f}`) : f,
          )
          .join(', '),
      );
    }
    if (str(detail.movedTo)) line(k('movedTo'), str(detail.movedTo));
    return out;
  }
  if (entityType !== 'territory') return null;

  const card = (v: unknown, field: string): string | null => {
    if (v === null || v === undefined || v === '') return k('none');
    if (field === 'kind' && typeof v === 'string') return t(`territories.card.kinds.${v}`);
    return String(v);
  };
  const number = str(detail.number);

  // The card corrected by hand: each field that moved, old and new.
  const before = detail.before as Record<string, unknown> | undefined;
  const after = detail.after as Record<string, unknown> | undefined;
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    for (const f of CARD_FIELDS) {
      if ((before[f] ?? null) === (after[f] ?? null)) continue;
      line(k(`card.${f}`), card(after[f], f), card(before[f], f));
    }
    if (detail.noteChanged === true) line(k('card.note'), k('changedWord'));
    return out;
  }

  if (number) line(k('territory'), number);
  if (detail.outline === 'edit' || detail.outline === 'undo') {
    line(k('outline'), k(detail.outline === 'edit' ? 'outlineEdit' : 'outlineUndo'));
    if (Array.isArray(detail.with) && detail.with.length) {
      line(k('with'), detail.with.filter((x) => typeof x === 'string').join(', '));
    }
    if (typeof detail.leaving === 'number' || typeof detail.gaining === 'number') {
      line(
        k('ground'),
        k('groundShares', { leaving: detail.leaving ?? 0, gaining: detail.gaining ?? 0 }),
      );
    }
  }
  if (detail.split === true && str(detail.made)) line(k('split'), k('splitNew', { number: detail.made }));
  if (str(detail.splitFrom)) line(k('splitFrom'), str(detail.splitFrom));
  if (str(detail.merged)) line(k('merged'), str(detail.merged));
  if (str(detail.mergedInto)) line(k('mergedInto'), str(detail.mergedInto));
  if ('lastWorkedOn' in detail) {
    line(k('lastWorked'), str(detail.lastWorkedOn) ? date(detail.lastWorkedOn as string) : k('never'));
  }
  if (typeof detail.noCallsMoved === 'number' && detail.noCallsMoved > 0) {
    line(k('noCallsMoved'), String(detail.noCallsMoved));
  }
  if (detail.holderTold === true) line(k('holderTold'), k('holderToldYes'));
  if (detail.archived === true) line(k('archive'), k('archivedOut'));
  if (detail.archived === false) line(k('archive'), k('archivedBack'));
  if (str(detail.undone)) line(k('undone'), k(`undoneWhat.${detail.undone}`));
  if (str(detail.category)) line(k('category'), t(`territories.category.one.${detail.category}`));
  // The list of a business territory (13 November 2026).
  if (typeof detail.businessesAdded === 'number') {
    line(k('businessesAdded'), str(detail.business) ?? String(detail.businessesAdded));
  }
  if (str(detail.businessEdited)) {
    line(k('businessEdited'), str(detail.businessEdited), str(detail.businessWas));
  }
  if (str(detail.businessRemoved)) line(k('businessRemoved'), str(detail.businessRemoved));
  return out;
}
