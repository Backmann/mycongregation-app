import { EventType } from './api';
import i18n from './i18n';

export type Subsection = 'opening' | 'treasures' | 'apply_yourself' | 'christian_life';

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
  /** Visual sub-section grouping (midweek only). Mirrors JW workbook color coding. */
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
    requiredCapability: 'demo_initial_call',
    requiredAssistantCapability: 'demo_initial_call',
    subsection: 'apply_yourself',
  },
  {
    key: 'apply_yourself_2',
    label: 'Apply Yourself 2',
    defaultOrder: 7,
    defaultDurationMin: 4,
    hasAssistant: true,
    requiredCapability: 'demo_return_visit',
    requiredAssistantCapability: 'demo_return_visit',
    subsection: 'apply_yourself',
  },
  {
    key: 'apply_yourself_3',
    label: 'Apply Yourself 3',
    defaultOrder: 8,
    defaultDurationMin: 4,
    hasAssistant: true,
    requiredCapability: 'demo_bible_study',
    requiredAssistantCapability: 'demo_bible_study',
    subsection: 'apply_yourself',
  },
  {
    key: 'living_christians_1',
    label: 'Living as Christians 1',
    defaultOrder: 9,
    defaultDurationMin: 15,
    requiredCapability: 'service_meeting_part',
    subsection: 'christian_life',
  },
  {
    key: 'living_christians_2',
    label: 'Living as Christians 2',
    defaultOrder: 10,
    defaultDurationMin: 15,
    requiredCapability: 'service_meeting_part',
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

export function getEventTypeLabel(type: EventType): string {
  return i18n.t(`eventTypes.${type}`);
}

// EVENT_TYPE_LABELS replaced by getEventTypeLabel() above.
