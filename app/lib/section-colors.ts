/**
 * One colour language for the whole schedule: the colour says WHAT a thing is,
 * never which meeting it belongs to (the title and date do that). The same four
 * colours are used by the section blocks, the home cards, the week drawer dots,
 * the print sheets and the marker on your own row — so a red row means a duty
 * wherever you meet it.
 */
export type SectionKind = 'meeting' | 'duty' | 'cleaning' | 'field_service';

export const SECTION_COLORS: Record<
  SectionKind,
  { color: string; soft: string; rgb: [number, number, number] }
> = {
  meeting: { color: '#f59e0b', soft: '#fffbeb', rgb: [245, 158, 11] },
  duty: { color: '#dc2626', soft: '#fef2f2', rgb: [220, 38, 38] },
  cleaning: { color: '#0ea5e9', soft: '#f0f9ff', rgb: [14, 165, 233] },
  field_service: { color: '#16a34a', soft: '#f0fdf4', rgb: [22, 163, 74] },
};

/** Shades within a section, e.g. the three kinds of cleaning. */
export const CLEANING_SHADES = {
  after_meeting: '#38bdf8',
  thorough: '#0ea5e9',
  general: '#0284c7',
};

/** `rgba()` string for a section colour — used by the breathing glow. */
export function sectionRgba(kind: SectionKind, alpha: number): string {
  const [r, g, b] = SECTION_COLORS[kind].rgb;
  return `rgba(${r},${g},${b},${alpha})`;
}
