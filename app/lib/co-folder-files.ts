import type { TFunction } from 'i18next';
import dayjs from 'dayjs';
import {
  attendanceApi,
  cartWeeksApi,
  coVisitItemsApi,
  publishersApi,
  specialEventsApi,
  territoriesApi,
  type CoVisitItem,
} from './api';
import { coFolderApi, fileName, groupNumber, optionsOf, QUESTIONS, type CoFolder, type FolderItem } from './co-folder';
import {
  buildAnswersHtml,
  buildContactsHtml,
  buildS21GroupHtml,
  buildTableHtml,
  buildTocHtml,
  itemsOf,
  personOf,
  placeOf,
  withTitle,
  type SheetHead,
  type TocLine,
} from './coFolderPdf';
import { buildS88Html } from './attendancePdf';
import { attendancePrintLabels } from './attendance-labels';
import { buildS13Html } from './s13Pdf';
import { buildLongUnworkedHtml, buildWholeMapHtml, type Geometry } from './territory-coverage';
import { formatDayShort } from './territory-view';
import { capitalizeFirst } from './relative-time';
import { formatDayRange } from './date-range';

/**
 * Making each file of the folder (17 November 2026). Each returns the sheet
 * and the name it is saved under — numbered as on the form, so the folder
 * on the computer sorts itself and «00 Оглавление» comes first.
 */
export interface FolderFile {
  html: string;
  name: string;
  landscape?: boolean;
  /** The fingerprint the data was read with; sent back with «saved». */
  stamp?: string | null;
}

export interface FileContext {
  folder: CoFolder;
  t: TFunction;
  lang: string;
  congregation: string;
  hall: string;
}

export function visitLine(ctx: FileContext): string {
  const { folder: f, t, lang } = ctx;
  const when = formatDayRange(f.visit.date, f.visit.endDate, lang, { year: 'always' });
  return [t('coFolder.pdf.visit', { when }), f.visit.overseer, ctx.congregation]
    .filter(Boolean)
    .join(' · ');
}

function head(ctx: FileContext, num: string, title: string): SheetHead {
  return {
    kicker: ctx.t('coFolder.pdf.kicker'),
    title: fileName(num, title),
    subtitle: `${visitLine(ctx)} · ${ctx.t('coFolder.pdf.madeOn', {
      date: dayjs(ctx.folder.today).locale(ctx.lang).format('D MMMM YYYY'),
    })}`,
    foot: ctx.t('coFolder.pdf.deleteAfter'),
  };
}

const day = (ctx: FileContext, iso: string) =>
  capitalizeFirst(dayjs(iso).locale(ctx.lang).format('dd, D MMMM'));

/** The title of an item, as the folder writes it. */
export function itemTitle(t: TFunction, key: string): string {
  return t(`coFolder.item.${key.replace('.', '_')}.title`);
}

async function visitItems(ctx: FileContext): Promise<CoVisitItem[]> {
  return coVisitItemsApi.list(ctx.folder.visit.id);
}

/** The file of one item (or one group of 2.1, key «2.1:<id>»). */
export async function makeFile(ctx: FileContext, key: string, item: FolderItem): Promise<FolderFile> {
  const { t, lang, folder } = ctx;
  const c = (k: string) => t(`coFolder.pdf.col.${k}`);
  const empty = t('coFolder.pdf.empty');
  if (key.startsWith('2.1:')) {
    const line = item.groups!.find((g) => g.key === key)!;
    const num = groupNumber(item, key);
    const group = line.name ?? t('coFolder.noGroup');
    const name = fileName(num, `S-21 ${group}`);
    const data = await coFolderApi.s21(folder.visit.id, key.slice(4));
    return { html: buildS21GroupHtml(name, data.cards, lang, empty), name, stamp: data.stamp };
  }
  const title = itemTitle(t, key);
  const h = head(ctx, key, title);
  switch (key) {
    case '1.3': {
      const rows = itemsOf(await visitItems(ctx), ['pastoral']).map((i) => [
        day(ctx, i.itemDate),
        i.startTime,
        i.note,
        personOf(i),
      ]);
      return { html: buildTableHtml(h, [c('day'), c('time'), c('whom'), c('withElder')], rows, empty), name: h.title };
    }
    case '1.4': {
      const ev = await specialEventsApi.getById(folder.visit.id);
      const host = ev.coAccommodationPublisherId
        ? await publishersApi.getById(ev.coAccommodationPublisherId).catch(() => null)
        : null;
      const rows =
        host || ev.coAccommodationAddress
          ? [[
              host ? `${host.lastName} ${host.firstName}`.trim() : '',
              host?.mobilePhone ?? '',
              host?.email ?? '',
              host?.address ?? ev.coAccommodationAddress ?? '',
            ]]
          : [];
      return {
        html: buildTableHtml(h, [c('host'), c('phone'), c('email'), c('address')], rows, t('coFolder.pdf.noLodging')),
        name: h.title,
      };
    }
    case '1.5': {
      const rows = itemsOf(await visitItems(ctx), ['lunch', 'lunch_box']).map((i) => [
        day(ctx, i.itemDate),
        i.startTime,
        personOf(i),
        i.kind === 'lunch_box' ? t('coFolder.pdf.lunchBox') : i.forWife ? t('coFolder.pdf.forWife') : t('coFolder.pdf.forBoth'),
        i.assigneeAddress,
      ]);
      return {
        html: buildTableHtml(h, [c('day'), c('time'), c('host'), c('forWhom'), c('address')], rows, empty),
        name: h.title,
      };
    }
    case '2.2': {
      const start = Number(folder.visit.date.slice(0, 4)) - (Number(folder.visit.date.slice(5, 7)) >= 9 ? 0 : 1);
      const [year, previous] = await Promise.all([
        attendanceApi.serviceYear(start),
        attendanceApi.serviceYear(start - 1).catch(() => null),
      ]);
      const html = buildS88Html({
        year,
        previous,
        congregationName: ctx.congregation,
        monthName: (m) => capitalizeFirst(dayjs(m).locale(lang).format('MMMM')),
        monthYearName: (m) => dayjs(m).locale(lang).format('MMMM YYYY'),
        dayName: (d) => dayjs(d).locale(lang).format('D MMMM'),
        reasonName: (r) => (r ? t(`attendance.reason.${r}`).toLocaleLowerCase(lang) : null),
        printedOn: dayjs().locale(lang).format('D MMMM YYYY'),
        serviceYearLabel: (y) => t('attendance.serviceYear', { from: y, to: y + 1 }),
        labels: attendancePrintLabels(t),
      });
      return { html: withTitle(html, h.title), name: h.title };
    }
    case '2.5': {
      const data = await coFolderApi.contacts(folder.visit.id);
      return {
        html: buildContactsHtml(
          h,
          data.people,
          { name: c('name'), group: c('group'), phone: c('phone'), email: c('email'), address: c('address') },
          t('coFolder.noGroup'),
          empty,
        ),
        name: h.title,
        stamp: data.stamp,
      };
    }
    case '3.1': {
      // The visit's service year, which is the current one or the one ahead.
      const sy = Number(folder.visit.date.slice(0, 4)) + (Number(folder.visit.date.slice(5, 7)) >= 9 ? 1 : 0);
      const thisYear = await territoriesApi.s13(sy, 'residential').catch(() => territoriesApi.s13(sy - 1, 'residential'));
      return { html: withTitle(buildS13Html(thisYear, t), h.title), name: h.title };
    }
    case '3.3': {
      const items = itemsOf(await visitItems(ctx), ['field_service']);
      const lines: { iso: string; time: string; row: (string | null)[] }[] = items.map((i) => ({
        iso: i.itemDate,
        time: i.startTime ?? '',
        row: [
          day(ctx, i.itemDate),
          i.startTime,
          placeOf(i, ctx.hall),
          i.withWife ? t('coFolder.pdf.together') : i.forWife ? t('coFolder.pdf.wife') : t('coFolder.pdf.overseer'),
        ],
      }));
      // The stand in the visit week, with places, hours and who stands —
      // where the week is planned in the app (form: «если такой график
      // ведётся»).
      const monday = dayjs(folder.visit.date)
        .subtract((dayjs(folder.visit.date).day() + 6) % 7, 'day')
        .format('YYYY-MM-DD');
      const week = await cartWeeksApi.getWeek(monday).catch(() => null);
      for (const d of week?.days ?? []) {
        if (d.date < folder.visit.date || d.date > folder.visit.endDate) continue;
        lines.push({
          iso: d.date,
          time: d.startTime,
          row: [
            day(ctx, d.date),
            `${d.startTime}–${d.endTime}`,
            `${t('coFolder.pdf.stand')}: ${d.locationName}`,
            (d.plan ?? []).map((p) => p.name).join(', '),
          ],
        });
      }
      lines.sort((a, b) => a.iso.localeCompare(b.iso) || a.time.localeCompare(b.time));
      return {
        html: buildTableHtml(h, [c('day'), c('time'), c('place'), c('who')], lines.map((l) => l.row), empty),
        name: h.title,
      };
    }
    case '3.4': {
      const rows = itemsOf(await visitItems(ctx), ['field_service']).map((i) => [
        day(ctx, i.itemDate),
        i.startTime,
        i.withWife ? t('coFolder.pdf.together') : i.forWife ? t('coFolder.pdf.wife') : t('coFolder.pdf.overseer'),
        i.withWife && !personOf(i) ? t('coFolder.pdf.eachOther') : personOf(i),
      ]);
      return { html: buildTableHtml(h, [c('day'), c('time'), c('goes'), c('partner')], rows, empty), name: h.title };
    }
    case '3.5': {
      const data = await territoriesApi.longUnworked();
      return {
        html: withTitle(buildLongUnworkedHtml(data, ctx.congregation, t, (iso) => formatDayShort(iso, lang)), h.title),
        name: h.title,
      };
    }
    case '3.6': {
      const [rows, boundary] = await Promise.all([territoriesApi.list(), territoriesApi.boundary()]);
      const html = buildWholeMapHtml(
        rows
          .filter((r) => (r.category ?? 'residential') === 'residential')
          .map((r) => ({ number: r.number, geometry: r.geometry as Geometry, held: !!r.holder })),
        (boundary?.geometry as Geometry | undefined) ?? null,
        { size: 'A4', status: false, title: h.title },
        t,
      );
      return { html: withTitle(html, h.title), name: h.title };
    }
    default:
      throw new Error(`no file for ${key}`);
  }
}

/** Page 2 as answered — «4 Ответы стр. 2». */
export function answersFile(ctx: FileContext): FolderFile {
  const { t, folder } = ctx;
  const title = t('coFolder.page2.fileTitle');
  const h = head(ctx, '4', title);
  return {
    html: buildAnswersHtml(
      h,
      QUESTIONS.map((n) => ({
        n,
        text: t(`coFolder.q.${n}`),
        answer: folder.page2?.answers[String(n)]?.answer ?? null,
      })),
      { yes: t('coFolder.answer.yes'), no: t('coFolder.answer.no'), na: t('coFolder.answer.na') },
      '—',
    ),
    name: h.title,
  };
}

/** How a line goes, for the table of contents. */
export function howOf(ctx: FileContext, item: FolderItem): string[] {
  const { t } = ctx;
  if (item.state === 'na') return [t('coFolder.state.na')];
  if (item.state === 'paper') return [t('coFolder.state.paper')];
  if (item.state === 'separate') return [t('coFolder.state.separate')];
  if (item.key === '2.1') {
    return (item.groups ?? []).map((g) => `${fileName(groupNumber(item, g.key), `S-21 ${g.name ?? t('coFolder.noGroup')}`)}.pdf`);
  }
  return [`${fileName(item.key, itemTitle(t, item.key))}.pdf`];
}

/** «00 Оглавление». */
export function tocFile(ctx: FileContext): FolderFile {
  const { t, folder } = ctx;
  const title = t('coFolder.toc.title');
  const h = head(ctx, '00', title);
  const lines: TocLine[] = folder.items.map((i) => ({
    num: i.key,
    title: itemTitle(t, i.key) + (i.extra ? ` (${t('coFolder.extra')})` : ''),
    how: howOf(ctx, i).join(' · '),
  }));
  lines.push({ num: '4', title: t('coFolder.page2.fileTitle'), how: `${fileName('4', t('coFolder.page2.fileTitle'))}.pdf` });
  return {
    html: buildTocHtml(h, lines, { item: t('coFolder.toc.item'), how: t('coFolder.toc.how') }),
    name: h.title,
  };
}

/** Options a question has, as words. */
export function optionWords(t: TFunction, q: number): { value: 'yes' | 'no' | 'na'; label: string }[] {
  return optionsOf(q).map((v) => ({ value: v, label: t(`coFolder.answer.${v}`) }));
}
