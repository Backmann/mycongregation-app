import type { TFunction } from "i18next";
import { dutiesApi, extractErrorMessage, type MonthDutyMeeting } from "./api";
import { exportHtmlAsPdf, openPrintWindow } from "./pdf";
import { buildDutiesMonthPdfHtml, type MonthPdfSection } from "./dutiesMonthPdf";
import { monthTable, rowTitle } from "./duty-month-table";
import { DUTY_ICONS } from "../components/DutiesSection";
import { getEventTypeLabel } from "./parts";
import { capitalizeFirst } from "./relative-time";
import { reportError } from "./error-bus";

/**
 * The duties of a month as a sheet for the notice board (27 October 2026).
 *
 * Built from GET /duties/month — the same answer the month table shows — so
 * the sheet and the screen cannot disagree. The old sheet read only the
 * sheets already written: since a meeting nobody has filled no longer writes
 * one, its meetings would have vanished from the page; it also put a Sunday
 * the 1st in the month before (it went by the week's Monday), grouped the
 * congregation's own places by slot number, and worked the days out by a
 * formula of its own, missing a meeting moved by the overseer's visit.
 *
 * It opens the print window before its first await, so it must be called
 * straight from the tap.
 */
export async function printDutiesMonth({
  month,
  congregationName,
  hallAddress,
  nameOf,
  t,
  lang,
  onBusy,
}: {
  /** YYYY-MM */
  month: string;
  congregationName: string | null;
  hallAddress: string | null;
  /** A person's name as the roster gives it. */
  nameOf: (publisherId: string) => string | null;
  t: TFunction;
  lang: string;
  onBusy: (busy: boolean) => void;
}): Promise<void> {
  const win = openPrintWindow();
  onBusy(true);
  try {
    const data = await dutiesApi.month(month);
    const at = (iso: string) => new Date(`${iso}T00:00:00`);
    const column = (m: MonthDutyMeeting) => ({
      label: capitalizeFirst(
        at(m.date)
          .toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" })
          .replace(",", ""),
      ),
      sub: m.held ? m.time : null,
      note: m.held ? null : t(`dutiesMonth.notHeld.${m.notHeld ?? "event"}`),
    });

    const sections: MonthPdfSection[] = (["midweek", "weekend"] as const)
      .map((kind) => {
        // A convention week has no kind of its own: it stands in both.
        const meetings = data.meetings.filter((m) => m.eventType === kind || m.eventType === null);
        if (!meetings.some((m) => m.held)) return null;
        const table = monthTable(meetings);
        return {
          title: getEventTypeLabel(kind),
          columns: meetings.map(column),
          rows: table.rows.map((r) => ({
            label: rowTitle(table, r.key, r.row, r.ordinal, t),
            color: DUTY_ICONS[r.row.dutyType]?.color ?? "#64748b",
            cells: meetings.map((m, i) => {
              const id = m.held ? table.cells[i].get(r.key)?.row.publisherId : null;
              return id ? shortOf(nameOf(id)) : null;
            }),
          })),
        };
      })
      .filter((s): s is MonthPdfSection => s !== null);

    if (sections.length === 0) {
      win?.close();
      return;
    }
    const monthLabel = capitalizeFirst(
      new Date(`${month}-01T00:00:00`).toLocaleDateString(lang, { month: "long", year: "numeric" }),
    );
    const html = buildDutiesMonthPdfHtml({
      sections,
      title: t("dutiesMonth.pdf.title"),
      monthLabel,
      congregationName,
      hallAddress,
      locale: lang,
      labels: { place: t("dutiesMonth.place"), empty: "—", printed: t("dutiesMonth.pdf.printed") },
    });
    await exportHtmlAsPdf(html, {
      fileName: `${t("dutiesMonth.pdf.title")} ${month}`,
      preopenedWindow: win,
      landscape: true,
    });
  } catch (e) {
    // Printing used to fail in silence: the print window just vanished.
    win?.close();
    reportError(extractErrorMessage(e));
  } finally {
    onBusy(false);
  }
}

/** «Вебер Андреас» → «Вебер А.»: a cell of the board's sheet has room for that. */
function shortOf(name: string | null): string | null {
  if (!name) return null;
  const [last, first] = name.trim().split(/\s+/);
  return first ? `${last} ${first[0]}.` : last;
}
