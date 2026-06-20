import { EventType } from './api';
import i18n from './i18n';

export type Subsection =
  | 'opening'
  | 'treasures'
  | 'apply_yourself'
  | 'christian_life'
  | 'public_talk'
  | 'watchtower'
  | 'concluding_talk'
  | 'closing';

export interface PartDef {
  key: string;
  label: string;
  defaultOrder: number;
  defaultDurationMin: number;
  /** True if this part has both a primary and assistant role (e.g. demonstrations). */
  hasAssistant?: boolean;
  /** Capability key required for the primary publisher. Used to filter the picker. */
  requiredCapability?: string;
  /** Capability key required for the assistant. Defaults to requiredCapability if omitted. */
  requiredAssistantCapability?: string;
  /** Visual sub-section grouping (midweek only). Mirrors the workbook color coding. */
  subsection?: Subsection;
}

export interface SubsectionMeta {
  key: Subsection;
  /** Primary banner background color. */
  color: string;
  /** Lighter shade for accents. */
  colorMuted: string;
  /** Ionicon name for banner. */
  icon: string;
  /** i18n key for the section title. */
  i18nKey: string;
}

export const SUBSECTIONS: Record<Subsection, SubsectionMeta> = {
  opening: {
    key: 'opening',
    color: '#475569',
    colorMuted: '#f1f5f9',
    icon: 'time-outline',
    i18nKey: 'schedule.subsection.opening',
  },
  treasures: {
    key: 'treasures',
    color: '#0e7490',
    colorMuted: '#cffafe',
    icon: 'diamond-outline',
    i18nKey: 'schedule.subsection.treasures',
  },
  apply_yourself: {
    key: 'apply_yourself',
    color: '#b45309',
    colorMuted: '#fef3c7',
    icon: 'paper-plane-outline',
    i18nKey: 'schedule.subsection.applyYourself',
  },
  christian_life: {
    key: 'christian_life',
    color: '#991b1b',
    colorMuted: '#fee2e2',
    icon: 'people-outline',
    i18nKey: 'schedule.subsection.christianLife',
  },
  public_talk: {
    key: 'public_talk',
    color: '#5b21b6',
    colorMuted: '#f3eefe',
    icon: 'mic-outline',
    i18nKey: 'schedule.subsection.publicTalk',
  },
  watchtower: {
    key: 'watchtower',
    color: '#6d28d9',
    colorMuted: '#f5f0ff',
    icon: 'book-outline',
    i18nKey: 'schedule.subsection.watchtower',
  },
  concluding_talk: {
    key: 'concluding_talk',
    color: '#0f766e',
    colorMuted: '#ccfbf1',
    icon: 'flag-outline',
    i18nKey: 'schedule.subsection.concludingTalk',
  },
  // Weekend opening (chairman/song/prayer) and the closing prayer render as
  // plain rows without a banner, so these metas are only used for grouping
  // order; the i18nKey is never shown for them.
  closing: {
    key: 'closing',
    color: '#475569',
    colorMuted: '#f1f5f9',
    icon: 'time-outline',
    i18nKey: 'schedule.subsection.opening',
  },
};

// ---------- Midweek meeting (Жизнь и служение) ----------

export const MIDWEEK_PARTS: PartDef[] = [
  {
    key: 'midweek_chairman',
    label: 'Chairman',
    defaultOrder: 1,
    defaultDurationMin: 0,
    requiredCapability: 'midweek_chairman',
    subsection: 'opening',
  },
  {
    key: 'midweek_opening_prayer',
    label: 'Opening prayer',
    defaultOrder: 2,
    defaultDurationMin: 1,
    requiredCapability: 'midweek_opening_prayer',
    subsection: 'opening',
  },
  {
    key: 'treasures_talk',
    label: "Treasures from God's Word",
    defaultOrder: 3,
    defaultDurationMin: 10,
    requiredCapability: 'treasures_talk',
    subsection: 'treasures',
  },
  {
    key: 'spiritual_gems',
    label: 'Spiritual Gems',
    defaultOrder: 4,
    defaultDurationMin: 10,
    requiredCapability: 'spiritual_gems',
    subsection: 'treasures',
  },
  {
    key: 'bible_reading',
    label: 'Bible reading',
    defaultOrder: 5,
    defaultDurationMin: 4,
    requiredCapability: 'bible_reading',
    subsection: 'treasures',
  },
  {
    key: 'apply_yourself_1',
    label: 'Apply Yourself 1',
    defaultOrder: 6,
    defaultDurationMin: 4,
    hasAssistant: true,
    requiredCapability: 'fs_starting_conversation',
    requiredAssistantCapability: 'fs_starting_conversation',
    subsection: 'apply_yourself',
  },
  {
    key: 'apply_yourself_2',
    label: 'Apply Yourself 2',
    defaultOrder: 7,
    defaultDurationMin: 4,
    hasAssistant: true,
    requiredCapability: 'fs_following_up',
    requiredAssistantCapability: 'fs_following_up',
    subsection: 'apply_yourself',
  },
  {
    key: 'apply_yourself_3',
    label: 'Apply Yourself 3',
    defaultOrder: 8,
    defaultDurationMin: 4,
    hasAssistant: true,
    requiredCapability: 'fs_making_disciples',
    requiredAssistantCapability: 'fs_making_disciples',
    subsection: 'apply_yourself',
  },
  {
    key: 'apply_yourself_4',
    label: 'Apply Yourself 4',
    defaultOrder: 9,
    defaultDurationMin: 4,
    hasAssistant: true,
    subsection: 'apply_yourself',
  },
  {
    key: 'living_christians_1',
    label: 'Living as Christians 1',
    defaultOrder: 9,
    defaultDurationMin: 15,
    requiredCapability: 'fs_talk',
    subsection: 'christian_life',
  },
  {
    key: 'living_christians_2',
    label: 'Living as Christians 2',
    defaultOrder: 10,
    defaultDurationMin: 15,
    requiredCapability: 'fs_talk',
    subsection: 'christian_life',
  },
  {
    key: 'cbs_conductor',
    label: 'CBS Conductor',
    defaultOrder: 11,
    defaultDurationMin: 30,
    requiredCapability: 'congregation_study_conductor',
    subsection: 'christian_life',
  },
  {
    key: 'cbs_reader',
    label: 'CBS Reader',
    defaultOrder: 12,
    defaultDurationMin: 30,
    requiredCapability: 'congregation_study_reader',
    subsection: 'christian_life',
  },
  {
    // Circuit overseer visit: replaces the Congregation Bible Study. Given by
    // the visiting overseer (a free-text speaker), so no required capability.
    key: 'co_service_talk',
    label: 'Service talk (circuit overseer)',
    defaultOrder: 11,
    defaultDurationMin: 30,
    subsection: 'christian_life',
  },
  {
    key: 'midweek_closing_prayer',
    label: 'Closing prayer',
    defaultOrder: 13,
    defaultDurationMin: 1,
    requiredCapability: 'midweek_opening_prayer',
    subsection: 'christian_life',
  },
];

// ---------- Weekend meeting (Сторожевая башня + Публичный доклад) ----------

export const WEEKEND_PARTS: PartDef[] = [
  {
    key: 'weekend_chairman',
    label: 'Chairman',
    defaultOrder: 1,
    defaultDurationMin: 0,
    requiredCapability: 'weekend_chairman',
  },
  {
    key: 'weekend_opening_prayer',
    label: 'Opening prayer',
    defaultOrder: 2,
    defaultDurationMin: 1,
    requiredCapability: 'weekend_opening_prayer',
  },
  {
    key: 'public_talk_speaker',
    label: 'Public talk',
    defaultOrder: 3,
    defaultDurationMin: 30,
    requiredCapability: 'public_talk_speaker',
  },
  {
    key: 'watchtower_conductor',
    label: 'Watchtower study — conductor',
    defaultOrder: 4,
    defaultDurationMin: 60,
    requiredCapability: 'watchtower_conductor',
  },
  {
    key: 'watchtower_reader',
    label: 'Watchtower study — reader',
    defaultOrder: 5,
    defaultDurationMin: 60,
    requiredCapability: 'watchtower_reader',
  },
  {
    // Circuit overseer visit: concluding talk after the Watchtower study,
    // given by the visiting overseer (free-text speaker).
    key: 'co_concluding_talk',
    label: 'Concluding talk (circuit overseer)',
    defaultOrder: 5,
    defaultDurationMin: 30,
  },
  {
    key: 'weekend_closing_prayer',
    label: 'Closing prayer',
    defaultOrder: 6,
    defaultDurationMin: 1,
    requiredCapability: 'weekend_opening_prayer',
  },
];

export const PARTS_BY_EVENT: Record<EventType, PartDef[]> = {
  midweek: MIDWEEK_PARTS,
  weekend: WEEKEND_PARTS,
  cleaning: [],
  av_duty: [],
  public_witnessing: [],
};

const ALL_PARTS = new Map<string, PartDef>();
[...MIDWEEK_PARTS, ...WEEKEND_PARTS].forEach((p) => ALL_PARTS.set(p.key, p));

export function getPartDef(key: string): PartDef | undefined {
  return ALL_PARTS.get(key);
}

export function getPartLabel(key: string): string {
  const def = ALL_PARTS.get(key);
  if (!def) return key;
  return i18n.t(`parts.${key}`, { defaultValue: def.label });
}

/**
 * Subsection for a part key, even for keys not in the registry (e.g. a 4th/5th
 * apply-yourself or living-as-Christians part), inferred from the key prefix.
 */
const NON_NUMBERED_PARTS = new Set<string>([
  'midweek_chairman',
  'weekend_chairman',
  'midweek_opening_prayer',
  'midweek_closing_prayer',
  'weekend_opening_prayer',
  'weekend_closing_prayer',
  'cbs_reader',
  'watchtower_reader',
  'mid_song',
  'weekend_song',
  'weekend_opening_song',
]);

/** Parts that get a sequential number (excludes chairmen/prayers/readers). */
/**
 * "Apply Yourself to the Field Ministry" parts are imported numbered by their
 * position in the meeting (apply_yourself_1..N), but the actual ministry skill
 * is named in the part's title. Derive the matching capability from the title
 * so the picker filters by the REAL skill rather than the positional default.
 * Russian headings only (mirrors the RU-only parser); returns null when the
 * skill is not recognized, so callers fall back to the positional capability.
 */
export function skillCapabilityFromTitle(
  title: string | null | undefined,
): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes('начина') && t.includes('разговор'))
    return 'fs_starting_conversation';
  if (t.includes('развива') && t.includes('интерес')) return 'fs_following_up';
  if (t.includes('ученик') && (t.includes('подготав') || t.includes('готов')))
    return 'fs_making_disciples';
  if (t.includes('объясня') && t.includes('взгляд'))
    return 'fs_explaining_beliefs';
  if (t.includes('речь')) return 'fs_talk';
  return null;
}

export function isNumberedPart(key: string): boolean {
  return !NON_NUMBERED_PARTS.has(key);
}

/** Map of assignment id -> display number (null for non-numbered info rows). */
export function buildPartNumbers(
  items: { id: string; partKey: string; partOrder: number | null }[],
): Map<string, number | null> {
  const sorted = [...items].sort(
    (a, b) => (a.partOrder ?? 0) - (b.partOrder ?? 0),
  );
  const map = new Map<string, number | null>();
  let n = 0;
  for (const it of sorted) {
    if (isNumberedPart(it.partKey)) {
      n += 1;
      map.set(it.id, n);
    } else {
      map.set(it.id, null);
    }
  }
  return map;
}

export function resolveSubsection(key: string): Subsection {
  const def = getPartDef(key);
  if (def?.subsection) return def.subsection;
  // Weekend grouping is kept here (not on PartDef) so it only affects the
  // schedule screen — My Tasks reads PartDef.subsection and stays unchanged.
  // The two main parts form labeled sections; the pre-study song joins the
  // Watchtower study; chairman/prayers/opening song stay in the unlabeled
  // opening group; the closing prayer renders last with no heading.
  if (key === 'public_talk_speaker') return 'public_talk';
  if (key === 'co_concluding_talk') return 'concluding_talk';
  if (
    key === 'watchtower_conductor' ||
    key === 'watchtower_reader' ||
    key === 'weekend_song'
  ) {
    return 'watchtower';
  }
  if (key === 'weekend_closing_prayer') return 'closing';
  if (key === 'weekend_opening_song') return 'opening';
  if (key.startsWith('apply_yourself')) return 'apply_yourself';
  if (
    key === 'mid_song' ||
    key.startsWith('living_christians') ||
    key.startsWith('cbs_')
  ) {
    return 'christian_life';
  }
  if (
    key === 'treasures_talk' ||
    key === 'spiritual_gems' ||
    key === 'bible_reading'
  ) {
    return 'treasures';
  }
  return 'opening';
}

export function getEventTypeLabel(type: EventType): string {
  return i18n.t(`eventTypes.${type}`);
}

// EVENT_TYPE_LABELS replaced by getEventTypeLabel() above.
