/**
 * A PART'S WHOLE TEXT (23 November 2026). The import keeps the workbook's first
 * paragraph of a part whole (server assignments.part_text), and the title only
 * its beginning, cut at a word with «…» (mwb-parser shortNote).
 */
/**
 * A part's whole text from the workbook, for where the part is read (its window,
 * 23 November 2026) — only when the title is still the import's own and keeps
 * less than all of it. Null otherwise: nothing to add.
 */
export function partFullText(a: {
  partTitle: string | null;
  importedTitle?: string | null;
  partText?: string | null;
}): string | null {
  const text = a.partText?.trim();
  if (!text || !a.partTitle || a.partTitle !== a.importedTitle) return null;
  const idx = a.partTitle.indexOf(': ');
  const shown = idx > 0 ? a.partTitle.slice(idx + 2) : a.partTitle;
  return shown.trim() === text ? null : text;
}
