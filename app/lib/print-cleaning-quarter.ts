import type { TFunction } from "i18next";
import { cleaningApi, extractErrorMessage, MeetingSettingsVersion, serviceGroupsApi, SpecialEvent } from "./api";
import { addDays, addWeeks, formatDateISO, startOfWeekMonday } from "./dates";
import { exportHtmlAsPdf, openPrintWindow } from "./pdf";
import {
  buildCleaningSchedulePdfHtml,
  type CleaningPdfWeek,
  type CleaningPdfRow,
} from "./cleaningSchedulePdf";
import { CLEANING_SHADES } from "./section-colors";
import { reportError } from "./error-bus";

// Monthly cleaning PDF: a grid of cleaning slots (rows) x weeks (columns) with
// the assigned service group per cell. Weeks grouped by Monday. Loads each
// week's cleaning assignments (getWeek is per-week) plus the service groups.
//
// Moved here unchanged from the programme screen. It opens the print window
// before its first await, so it must be called straight from the tap.
export async function printCleaningQuarter({
  weekStart,
  meetingVersion,
  events,
  congregationName,
  t,
  lang,
  onBusy,
}: {
  weekStart: Date;
  meetingVersion: MeetingSettingsVersion | null;
  events: SpecialEvent[];
  congregationName: string | null;
  t: TFunction;
  lang: string;
  onBusy: (busy: boolean) => void;
}): Promise<void> {
  const win = openPrintWindow();
  onBusy(true);
  try {
    // Print the calendar quarter (3 months) that the viewed week falls in:
    // Q1 Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep, Q4 Oct–Dec. Each month is its own
    // block. Weeks belong to the month of their Monday.
    const viewedMonth = weekStart.getMonth();
    const year = weekStart.getFullYear();
    const quarterStartMonth = Math.floor(viewedMonth / 3) * 3;
    const monthsInQuarter = [
      quarterStartMonth,
      quarterStartMonth + 1,
      quarterStartMonth + 2,
    ];

    const congressNote = (mon: Date): string | null => {
      const satISO = formatDateISO(addDays(mon, 5));
      const sunISO = formatDateISO(addDays(mon, 6));
      const midISO = formatDateISO(addDays(mon, 3));
      const c = events.find((e) => {
        if (e.type !== "regional_convention" && e.type !== "circuit_assembly")
          return false;
        const end = e.endDate ?? e.date;
        return (
          (e.date <= sunISO && satISO <= end) ||
          (e.date <= midISO && end >= midISO)
        );
      });
      return c ? t(`specialEvents.types.${c.type}`) : null;
    };

    // Mondays of a given month (a week belongs to the month of its Monday).
    const mondaysOfMonth = (monthIdx: number): Date[] => {
      const first = new Date(year, monthIdx, 1);
      let m = startOfWeekMonday(first);
      const out: Date[] = [];
      for (let i = 0; i < 6; i++) {
        if (m.getMonth() === monthIdx && m.getFullYear() === year) {
          out.push(new Date(m));
        }
        m = addWeeks(m, 1);
      }
      return out;
    };

    // Collect every Monday across the quarter, load groups + weeks in parallel.
    const allMondays: Date[] = monthsInQuarter.flatMap(mondaysOfMonth);
    if (allMondays.length === 0) {
      win?.close();
      return;
    }
    const [groupsRes, ...weekData] = await Promise.all([
      serviceGroupsApi.list(),
      ...allMondays.map((mon) => cleaningApi.getWeek(formatDateISO(mon))),
    ]);
    const groupsById = new Map((groupsRes.data ?? []).map((g) => [g.id, g]));
    const weekByISO = new Map<string, (typeof weekData)[number]>();
    allMondays.forEach((mon, idx) => {
      weekByISO.set(formatDateISO(mon), weekData[idx]);
    });

    const slotDefs: { slot: string; color: string }[] = [
      { slot: "after_meeting", color: CLEANING_SHADES.after_meeting },
      { slot: "thorough", color: CLEANING_SHADES.thorough },
      { slot: "general", color: CLEANING_SHADES.general },
    ];

    const months = monthsInQuarter.map((monthIdx) => {
      const mondays = mondaysOfMonth(monthIdx);
      const weeks: CleaningPdfWeek[] = mondays.map((mon) => {
        const sun = addDays(mon, 6);
        const label = `${mon.toLocaleDateString(lang, {
          day: "numeric",
        })}–${sun.toLocaleDateString(lang, {
          day: "numeric",
          month: "short",
        })}`;
        return {
          weekStartDate: formatDateISO(mon),
          label,
          note: congressNote(mon),
        };
      });
      const rows: CleaningPdfRow[] = slotDefs.map(({ slot, color }) => {
        const valueByWeek: Record<string, string | null> = {};
        mondays.forEach((mon) => {
          const iso = formatDateISO(mon);
          const wk = weekByISO.get(iso);
          const a = (wk?.assignments ?? []).find((x) => x.slotType === slot);
          if (!a) {
            valueByWeek[iso] = null;
          } else if (slot === "general") {
            valueByWeek[iso] = t("cleaning.allCongregation");
          } else {
            const g = a.serviceGroupId
              ? groupsById.get(a.serviceGroupId)
              : null;
            valueByWeek[iso] = g?.name ?? null;
          }
        });
        return { label: t(`cleaning.slots.${slot}`), color, valueByWeek };
      });
      return {
        monthLabel: new Date(year, monthIdx, 1).toLocaleDateString(
          lang,
          { month: "long", year: "numeric" },
        ),
        weeks,
        rows,
      };
    });

    // Period label, e.g. "Август — Октябрь 2026".
    const startName = new Date(year, quarterStartMonth, 1).toLocaleDateString(
      lang,
      { month: "long" },
    );
    const endName = new Date(
      year,
      quarterStartMonth + 2,
      1,
    ).toLocaleDateString(lang, { month: "long" });
    const periodLabel = `${startName} — ${endName} ${year}`;

    const html = buildCleaningSchedulePdfHtml({
      months,
      congregationName: congregationName,
      hallAddress: meetingVersion?.address ?? null,
      periodLabel,
      locale: lang,
      labels: {
        title: t("cleaning.title"),
        slotColumn: t("cleaning.slotColumn"),
        emptyCell: "—",
      },
    });
    await exportHtmlAsPdf(html, {
      fileName: t("cleaning.title"),
      preopenedWindow: win,
    });
  } catch (e) {
    // Printing used to fail in silence: the print window just vanished.
    win?.close();
    reportError(extractErrorMessage(e));
  } finally {
    onBusy(false);
  }
}
