import { EventType } from './api';

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
}

export const MIDWEEK_PARTS: PartDef[] = [
  {
    key: 'midweek_chairman',
    label: 'Chairman',
    defaultOrder: 1,
    defaultDurationMin: 0,
    requiredCapability: 'midweek_chairman',
  },
  {
    key: 'midweek_opening_prayer',
    label: 'Opening prayer',
    defaultOrder: 2,
    defaultDurationMin: 1,
    requiredCapability: 'midweek_opening_prayer',
  },
  {
    key: 'treasures_talk',
    label: "Treasures from God's Word",
    defaultOrder: 3,
    defaultDurationMin: 10,
    requiredCapability: 'treasures_talk',
  },
  {
    key: 'spiritual_gems',
    label: 'Spiritual Gems',
    defaultOrder: 4,
    defaultDurationMin: 10,
    requiredCapability: 'spiritual_gems',
  },
  {
    key: 'bible_reading',
    label: 'Bible reading',
    defaultOrder: 5,
    defaultDurationMin: 4,
    requiredCapability: 'bible_reading',
  },
  // Apply Yourself parts: any of the three demo capabilities qualifies for the
  // primary student. We use demo_initial_call as the canonical filter; for
  // mixed/talk-style AY parts the user can toggle "Show all" in the picker.
  {
    key: 'apply_yourself_1',
    label: 'Apply Yourself 1',
    defaultOrder: 6,
    defaultDurationMin: 4,
    hasAssistant: true,
    requiredCapability: 'demo_initial_call',
    requiredAssistantCapability: 'demo_initial_call',
  },
  {
    key: 'apply_yourself_2',
    label: 'Apply Yourself 2',
    defaultOrder: 7,
    defaultDurationMin: 4,
    hasAssistant: true,
    requiredCapability: 'demo_return_visit',
    requiredAssistantCapability: 'demo_return_visit',
  },
  {
    key: 'apply_yourself_3',
    label: 'Apply Yourself 3',
    defaultOrder: 8,
    defaultDurationMin: 4,
    hasAssistant: true,
    requiredCapability: 'demo_bible_study',
    requiredAssistantCapability: 'demo_bible_study',
  },
  {
    key: 'living_christians_1',
    label: 'Living as Christians 1',
    defaultOrder: 9,
    defaultDurationMin: 15,
    requiredCapability: 'service_meeting_part',
  },
  {
    key: 'living_christians_2',
    label: 'Living as Christians 2',
    defaultOrder: 10,
    defaultDurationMin: 15,
    requiredCapability: 'service_meeting_part',
  },
  {
    key: 'cbs_conductor',
    label: 'CBS Conductor',
    defaultOrder: 11,
    defaultDurationMin: 30,
    requiredCapability: 'congregation_study_conductor',
  },
  {
    key: 'cbs_reader',
    label: 'CBS Reader',
    defaultOrder: 12,
    defaultDurationMin: 30,
    requiredCapability: 'congregation_study_reader',
  },
  {
    key: 'midweek_closing_prayer',
    label: 'Closing prayer',
    defaultOrder: 13,
    defaultDurationMin: 1,
    requiredCapability: 'midweek_opening_prayer',
  },
];

export const PARTS_BY_EVENT: Record<EventType, PartDef[]> = {
  midweek: MIDWEEK_PARTS,
  weekend: [],
  cleaning: [],
  av_duty: [],
  public_witnessing: [],
};

const ALL_PARTS = new Map<string, PartDef>();
[...MIDWEEK_PARTS].forEach((p) => ALL_PARTS.set(p.key, p));

export function getPartDef(key: string): PartDef | undefined {
  return ALL_PARTS.get(key);
}

export function getPartLabel(key: string): string {
  return ALL_PARTS.get(key)?.label ?? key;
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  midweek: 'Midweek meeting',
  weekend: 'Weekend meeting',
  cleaning: 'Cleaning',
  av_duty: 'A/V duty',
  public_witnessing: 'Public witnessing',
};
