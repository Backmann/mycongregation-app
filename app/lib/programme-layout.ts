/**
 * Variant «В» of the programme screen (Р-02, 20 November 2026): how the week
 * and the open part share the screen. Pure — the gate holds it to examples
 * (scripts/check-programme-layout.mjs).
 *
 * - A phone and a tablet upright: as before — the part opens as a window
 *   over the week, the meetings stay folded until opened.
 * - With the side menu (window 1024 and wider): the part opens on the right
 *   and the week stays in view; the meetings mount open.
 * - From 960 of the screen's own area: the two meetings side by side, while
 *   no part is open beside them.
 */
import { SIDE_NAV_FROM } from './screen-width';

export const PANEL_FROM = 760;
export const TWO_COLUMNS_FROM = 960;
export const PANEL_WIDTH = 400;

export interface ProgrammeLayout {
  /** The part beside the week, not over it. */
  panel: boolean;
  /** Both meetings in one row of two columns. */
  twoColumns: boolean;
  /** The meetings are open when the screen mounts. */
  meetingsOpen: boolean;
}

export function programmeLayout(
  windowW: number,
  areaW: number,
  partOpen: boolean,
): ProgrammeLayout {
  const computer = windowW >= SIDE_NAV_FROM;
  const panel = computer && areaW >= PANEL_FROM;
  return {
    panel,
    twoColumns: computer && areaW >= TWO_COLUMNS_FROM && !(panel && partOpen),
    meetingsOpen: panel,
  };
}
