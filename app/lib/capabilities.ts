/**
 * Publisher capabilities — what assignments they can perform.
 * Stored as Record<string, boolean> in publisher.capabilities (jsonb).
 * Keys here are also stored in the DB; once a key is in production data,
 * don't rename it without a migration script.
 */

export interface CapabilityDef {
  key: string;
  label: string;
  /** Brother-only: shown grey/disabled for sisters. Validation only in UI. */
  brotherOnly?: boolean;
  /** Requires elder appointment (informational, not enforced). */
  elderOnly?: boolean;
  /** Requires baptism (informational, not enforced). */
  baptizedOnly?: boolean;
}

export interface CapabilityCategory {
  key: string;
  label: string;
  capabilities: CapabilityDef[];
}

export const CAPABILITY_CATEGORIES: CapabilityCategory[] = [
  {
    key: 'midweek',
    label: 'Midweek meeting',
    capabilities: [
      { key: 'midweek_chairman', label: 'Chairman', brotherOnly: true, elderOnly: true },
      { key: 'midweek_opening_prayer', label: 'Opening prayer', brotherOnly: true, baptizedOnly: true },
      { key: 'treasures_talk', label: 'Treasures from God\'s Word', brotherOnly: true, elderOnly: true },
      { key: 'spiritual_gems', label: 'Spiritual Gems', brotherOnly: true, baptizedOnly: true },
      { key: 'bible_reading', label: 'Bible reading', brotherOnly: true, baptizedOnly: true },
      { key: 'congregation_study_conductor', label: 'Congregation Bible Study conductor', brotherOnly: true, elderOnly: true },
      { key: 'congregation_study_reader', label: 'Congregation Bible Study reader', brotherOnly: true, baptizedOnly: true },
    ],
  },
  {
    key: 'weekend',
    label: 'Weekend meeting',
    capabilities: [
      { key: 'weekend_chairman', label: 'Chairman', brotherOnly: true, elderOnly: true },
      { key: 'weekend_opening_prayer', label: 'Opening prayer', brotherOnly: true, baptizedOnly: true },
      { key: 'public_talk_speaker', label: 'Public talk speaker', brotherOnly: true, elderOnly: true },
      { key: 'watchtower_conductor', label: 'Watchtower study conductor', brotherOnly: true, elderOnly: true },
      { key: 'watchtower_reader', label: 'Watchtower study reader', brotherOnly: true, baptizedOnly: true },
    ],
  },
  {
    key: 'field_service',
    label: 'Field service demonstrations',
    capabilities: [
      { key: 'demo_initial_call', label: 'Initial call demonstration' },
      { key: 'demo_return_visit', label: 'Return visit demonstration' },
      { key: 'demo_bible_study', label: 'Bible study demonstration' },
      { key: 'service_meeting_part', label: 'Service meeting part', brotherOnly: true },
    ],
  },
  {
    key: 'duties',
    label: 'Audio / Visual / Attendant',
    capabilities: [
      { key: 'attendant', label: 'Attendant' },
      { key: 'microphone', label: 'Microphone' },
      { key: 'stage', label: 'Stage / Platform' },
      { key: 'sound', label: 'Sound system' },
      { key: 'video_presenter', label: 'Video presenter' },
    ],
  },
  {
    key: 'cleaning',
    label: 'Cleaning',
    capabilities: [
      { key: 'cleaning_team', label: 'Regular cleaning' },
      { key: 'cleaning_special', label: 'Special / Quarterly cleaning' },
    ],
  },
];

/** Flat list of all capability defs, keyed for quick lookup. */
export const ALL_CAPABILITIES: Record<string, CapabilityDef> = Object.fromEntries(
  CAPABILITY_CATEGORIES.flatMap((cat) =>
    cat.capabilities.map((cap) => [cap.key, cap] as const),
  ),
);

/** Total count of all defined capabilities. */
export const TOTAL_CAPABILITIES = Object.keys(ALL_CAPABILITIES).length;

/** Counts active capabilities in a given record. */
export function countActiveCapabilities(caps: Record<string, boolean>): number {
  return Object.values(caps ?? {}).filter(Boolean).length;
}

/** Counts active capabilities in a given category. */
export function countActiveInCategory(
  caps: Record<string, boolean>,
  category: CapabilityCategory,
): number {
  return category.capabilities.filter((c) => caps?.[c.key]).length;
}
