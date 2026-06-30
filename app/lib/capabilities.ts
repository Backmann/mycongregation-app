/**
 * Publisher capabilities — what assignments they can perform.
 * Stored as Record<string, boolean> in publisher.capabilities (jsonb).
 * Keys here are also stored in the DB; once a key is in production data,
 * don't rename it without a migration script.
 *
 * The `label` strings below are dev fallbacks only — the UI always renders
 * via i18n (`capabilities.categories.${key}` / `capabilities.items.${key}`).
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
      { key: 'congregation_study_conductor', label: 'Congregation Bible Study', brotherOnly: true, elderOnly: true },
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
    // "Apply Yourself to the Field Ministry" (ОТТАЧИВАЕМ НАВЫКИ СЛУЖЕНИЯ)
    key: 'field_service',
    label: 'Apply Yourself to the Field Ministry',
    capabilities: [
      { key: 'fs_starting_conversation', label: 'Starting a Conversation' },
      { key: 'fs_following_up', label: 'Following Up' },
      { key: 'fs_making_disciples', label: 'Making Disciples' },
      { key: 'fs_explaining_beliefs', label: 'Explaining Your Beliefs' },
      { key: 'fs_talk', label: 'Talk', brotherOnly: true },
      {
        key: 'fs_meeting_conductor',
        label: 'Conducts field-service meeting',
        brotherOnly: true,
        baptizedOnly: true,
      },
    ],
  },
  {
    // Meeting duties (eligibility flags for the future Duties schedule feature)
    key: 'duties',
    label: 'Duties',
    capabilities: [
      { key: 'duty_security', label: 'Security' },
      { key: 'duty_attendant', label: 'Hall attendant' },
      { key: 'duty_zoom', label: 'Zoom' },
      { key: 'duty_microphone', label: 'Microphones' },
      { key: 'duty_audio', label: 'Audio' },
      { key: 'duty_video', label: 'Video' },
      { key: 'duty_stage', label: 'Stage' },
      { key: 'duty_ventilation', label: 'Ventilation' },
    ],
  },
  {
    key: 'hospitality',
    label: 'Hospitality',
    capabilities: [
      { key: 'hospitality', label: 'Hospitality' },
    ],
  },
  {
    // Public witnessing (carts) — eligibility for cart shifts
    key: 'public_witnessing',
    label: 'Public witnessing',
    capabilities: [
      { key: 'public_witnessing', label: 'Public witnessing' },
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
