import type { Duty, DutyPlace, DutyType, EventType } from './api';
import { OPTIONAL_DUTY_TYPES } from './duty-count';

/**
 * The congregation's places on the app's side (27 October 2026) — the same
 * rules as the server's duties/duty-places.ts, which is the authority.
 *
 * A meeting nobody has filled yet has NO sheet: opening it to look used to
 * write one into the database, and a sheet once written no longer follows
 * the template. Until the first person is put somewhere, the meeting shows its
 * places from the template as «virtual» rows; the first assignment asks the
 * server to cut the sheet (POST /duties/assign-place).
 */

/** One key per place: the type, or the congregation's own name. */
export function placeKey(p: { dutyType: DutyType | string; customLabel: string | null }): string {
  return p.dutyType === 'custom' ? `custom:${(p.customLabel ?? '').trim()}` : String(p.dutyType);
}

const VIRTUAL = 'virtual:';

export function isVirtualDuty(id: string): boolean {
  return id.startsWith(VIRTUAL);
}

/**
 * The rows a sheet WOULD have — the server cuts them the same way: slots
 * 0…count-1 for a predefined place, one running slot for the own ones.
 */
export function virtualDuties(places: DutyPlace[], weekStartDate: string, eventType: EventType): Duty[] {
  const out: Duty[] = [];
  let customSlot = 0;
  places.forEach((p, i) => {
    for (let n = 0; n < p.count; n++) {
      const label = p.dutyType === 'custom' ? p.customLabel : null;
      out.push({
        id: `${VIRTUAL}${p.dutyType}:${n}:${encodeURIComponent(label ?? '')}`,
        congregationId: '',
        weekStartDate,
        eventType,
        dutyType: p.dutyType,
        slotIndex: p.dutyType === 'custom' ? customSlot++ : n,
        sortOrder: i + 1,
        customLabel: label,
        publisherId: null,
        notes: p.notes ?? null,
      });
    }
  });
  return out;
}

/** Which place and which of its rows a virtual id stands for. */
export function parseVirtualDuty(
  id: string,
): { dutyType: DutyType; ordinal: number; customLabel: string | null } | null {
  if (!isVirtualDuty(id)) return null;
  const [dutyType, ordinal, label] = id.slice(VIRTUAL.length).split(':');
  const customLabel = decodeURIComponent(label ?? '');
  return {
    dutyType: dutyType as DutyType,
    ordinal: Number(ordinal),
    customLabel: customLabel === '' ? null : customLabel,
  };
}

/** The capability an own place asks for, or undefined — any brother. */
export function capabilityOfOwnPlace(label: string | null, places: DutyPlace[] | undefined): string | undefined {
  const key = placeKey({ dutyType: 'custom', customLabel: label });
  return places?.find((p) => placeKey(p) === key)?.capability ?? undefined;
}

/** How many places a meeting cut from these has, the optional ones aside. */
export function countedPlaces(places: DutyPlace[]): number {
  return places.filter((p) => !OPTIONAL_DUTY_TYPES.has(p.dutyType)).reduce((n, p) => n + p.count, 0);
}

/** The predefined places, in the order a new congregation's list has them. */
export const STANDARD_PLACES: DutyType[] = [
  'security',
  'attendant',
  'microphone',
  'av',
  'zoom',
  'stage',
  'ventilation',
  'timekeeper',
];

/** Card marks an own place may ask for. */
export const PLACE_CAPABILITIES = STANDARD_PLACES.map((t) => `duty_${t}`);

/** The card marks of the meeting places, `duty_<type>`. */
export const DUTY_CAPABILITY_KEYS = PLACE_CAPABILITIES;
