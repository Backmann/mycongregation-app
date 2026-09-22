import type { TFunction } from "i18next";
import { dutiesApi, extractErrorMessage, MeetingSettingsVersion, Publisher, SpecialEvent } from "./api";
import { addDays, addWeeks, formatDateISO, startOfWeekMonday } from "./dates";
import { meetingDate } from "./meeting-schedule";
import { exportHtmlAsPdf, openPrintWindow } from "./pdf";
import {
  buildDutiesSchedulePdfHtml,
  type DutiesPdfSection,
  type DutiesPdfWeek,
  type DutiesPdfRow,
} from "./dutiesSchedulePdf";
import { DUTY_ICONS, dutyLabel } from "../components/DutiesSection";
import { getEventTypeLabel } from "./parts";
import { SECTION_COLORS } from "./section-colors";
import { reportError } from "./error-bus";

// Monthly duties PDF: one page, midweek section on top, weekend below, each a
// grid of duty types (rows) x weeks (columns). A week belongs to the month of
// its Monday (same rule as the meeting PDF). Convention weeks show "Конгресс".
//
// Moved here unchanged from the programme screen. It opens the print window
// before its first await, so it must be called straight from the tap.
export async function printDutiesMonth({
  weekStart,
  meetingVersion,
  events,
  publishersById,
  congregationName,
  t,
  lang,
  onBusy,
}: {
  weekStart: Date;
  meetingVersion: MeetingSettingsVersion | null;
  events: SpecialEvent[];
  publishersById: Map<string, Publisher>;
  congregationName: string | null;
  t: TFunction;
  lang: string;
  onBusy: (busy: boolean) => void;
}): Promise<void> {
  if (!meetingVersion) return;
  const win = openPrintWindow();
  onBusy(true);
  try {
    const month = weekStart.getMonth();
    const year = weekStart.getFullYear();
    const firstOfMonth = new Date(year, month, 1);
    let m = startOfWeekMonday(firstOfMonth);
    const mondays: Date[] = [];
    for (let i = 0; i < 6; i++) {
      if (m.getMonth() === month && m.getFullYear() === year) {
        mondays.push(new Date(m));
      }
      m = addWeeks(m, 1);
    }
    if (mondays.length === 0) {
      win?.close();
      return;
    }
    const lastMonday = mondays[mondays.length - 1];

    // A convention covering a week -> that week has no duties ("Конгресс").
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

    // Load the month's duties once (server filters weekStartDate < weekEnd).
    const res = await dutiesApi.list({
      weekStart: formatDateISO(mondays[0]),
      weekEnd: formatDateISO(addWeeks(lastMonday, 1)),
    });
    const rows = res ?? [];
    const nameOf = (id: string | null): string | null =>
      id ? (publishersById.get(id)?.displayName ?? null) : null;

    const dutyColorOf = (dutyType: string): string =>
      DUTY_ICONS[dutyType]?.color ?? "#64748b";

    // Build one section (midweek/weekend).
    const buildSection = (
      kind: "midweek" | "weekend",
      title: string,
      accent: string,
    ): DutiesPdfSection => {
      const dow =
        kind === "midweek"
          ? meetingVersion.midweekDow
          : meetingVersion.weekendDow;
      const weeks: DutiesPdfWeek[] = mondays.map((mon) => ({
        weekStartDate: formatDateISO(mon),
        label: meetingDate(mon, dow ?? 3).toLocaleDateString(lang, {
          day: "numeric",
          month: "short",
        }),
        note: congressNote(mon),
      }));

      // Group this section's duties by a stable row key (type + slot), in the
      // canonical order, collecting the assignee per week.
      const forKind = rows.filter((d) => d.eventType === kind);
      const rowMap = new Map<string, DutiesPdfRow>();
      const rowOrder: string[] = [];
      for (const d of forKind) {
        const key = `${d.dutyType}|${d.slotIndex}`;
        if (!rowMap.has(key)) {
          rowMap.set(key, {
            label: dutyLabel(d, t),
            color: dutyColorOf(d.dutyType),
            nameByWeek: {},
          });
          rowOrder.push(key);
        }
        rowMap.get(key)!.nameByWeek[d.weekStartDate] = nameOf(d.publisherId);
      }
      // Sort rows by duty order then slot for a stable layout.
      const order = [
        "security",
        "attendant",
        "microphone",
        "av",
        "zoom",
        "stage",
        "ventilation",
        "custom",
      ];
      rowOrder.sort((a, b) => {
        const [ta, sa] = a.split("|");
        const [tb, sb] = b.split("|");
        const oa = order.indexOf(ta);
        const ob = order.indexOf(tb);
        return (
          (oa === -1 ? order.length : oa) - (ob === -1 ? order.length : ob) ||
          Number(sa) - Number(sb)
        );
      });
      return {
        title,
        accent,
        weeks,
        rows: rowOrder.map((k) => rowMap.get(k)!),
      };
    };

    const sections: DutiesPdfSection[] = [
      buildSection(
        "midweek",
        getEventTypeLabel("midweek"),
        SECTION_COLORS.duty.color,
      ),
      buildSection(
        "weekend",
        getEventTypeLabel("weekend"),
        SECTION_COLORS.duty.color,
      ),
    ].filter((s) => s.rows.length > 0);

    if (sections.length === 0) {
      win?.close();
      return;
    }

    const monthLabel = firstOfMonth.toLocaleDateString(lang, {
      month: "long",
      year: "numeric",
    });
    const html = buildDutiesSchedulePdfHtml({
      sections,
      congregationName: congregationName,
      hallAddress: meetingVersion.address ?? null,
      monthLabel,
      locale: lang,
      labels: {
        title: t("schedule.tabs.duties"),
        dutyColumn: t("duties.dutyColumn"),
        emptyCell: "—",
      },
    });
    await exportHtmlAsPdf(html, {
      fileName: t("schedule.tabs.duties"),
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
