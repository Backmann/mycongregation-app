/**
 * The Memorial, printed whole — the sheet a congregation actually sends round.
 *
 * Lionel asked for «абсолютно всё» on one page: the order of the evening, the
 * places the emblems pass, the duties, and every note attached to any of them.
 * That is one sheet because it is one evening; splitting it would mean two
 * pieces of paper that must be kept together, which is how things get lost.
 *
 * Built to match the sheets already in the app — the same header with its
 * coloured rule, the same rounded cards, the same quiet greys — so it reads as
 * one of the family rather than as something bolted on.
 *
 * The programme carries a NUMBER for a song and a NAME for everything else;
 * a place with several brothers is one card with the names under it, because
 * that is how the congregation reads it. Notes are printed in the margin
 * colour they have on screen: they are instructions, not decoration —
 * «светоотражающие жилетки» is the reason somebody is not turned away at the
 * gate.
 */

export interface MemorialPdfLine {
  label: string;
  /** Resolved name, or a hand-written one for a speaker from elsewhere. */
  name: string | null;
  /** Song number on a song line; null everywhere else. */
  songNumber: number | null;
  note: string | null;
}

export interface MemorialPdfPlace {
  label: string;
  names: (string | null)[];
  note: string | null;
}

export function buildMemorialPdfHtml(opts: {
  congregationName: string;
  /** «понедельник, 22 марта 2027 г.» */
  dateLabel: string;
  time: string | null;
  address: string | null;
  theme: string | null;
  programme: MemorialPdfLine[];
  /**
   * Every place of the evening — the door, the microphone, the parking, the
   * rows the emblems pass — in the order the congregation put them.
   *
   * NOT split in two. When the Memorial became a kind of meeting, the emblem
   * places and the duties both became ordinary duties of it, and nothing in a
   * row tells one from the other any more. Guessing from the name would put
   * «Главный зал» among the emblem rows because it contains «зал».
   */
  duties: MemorialPdfPlace[];
  printedOn: string;
  labels: {
    title: string;
    programme: string;
    duties: string;
    theme: string;
    song: string;
    unassigned: string;
    printed: string;
  };
}): string {
  const {
    congregationName,
    dateLabel,
    time,
    address,
    theme,
    programme,
    duties,
    printedOn,
    labels,
  } = opts;

  const person = (name: string | null) =>
    name
      ? `<span class="nm">${esc(name)}</span>`
      : `<span class="none">${esc(labels.unassigned)}</span>`;

  const programmeRows = programme
    .map((l) => {
      const right =
        l.songNumber !== null
          ? `<span class="song">${esc(labels.song)} ${l.songNumber}</span>`
          : person(l.name);
      return `<tr>
        <td class="k">${esc(l.label)}${
          l.note ? `<div class="note">${esc(l.note)}</div>` : ''
        }</td>
        <td class="v">${right}</td>
      </tr>`;
    })
    .join('');

  // A place with several brothers is ONE card with the names under it: that is
  // how the sheet is read aloud and how the hall is actually staffed.
  const placeCards = (places: MemorialPdfPlace[]) =>
    places
      .map(
        (p) => `<div class="place">
          <div class="pl">${esc(p.label)}</div>
          ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
          <div class="names">${p.names.map(person).join('')}</div>
        </div>`,
      )
      .join('');

  const section = (title: string, body: string) =>
    body
      ? `<section class="block">
          <h2>${esc(title)}</h2>
          ${body}
        </section>`
      : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    labels.title,
  )}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: A4 portrait; margin: 12mm; }
  .page { padding: 4px 0 0; }

  .pagehead { border-bottom: 3px solid #7c3aed; padding-bottom: 8px; margin-bottom: 12px; }
  .pagehead h1 { font-size: 20px; margin: 0; color: #6d28d9; letter-spacing: -0.2px; }
  .subtitle { font-size: 12px; color: #64748b; font-weight: 500; margin-top: 2px; }
  .chips { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: inline-block; font-size: 10.5px; color: #334155;
    background: #f1f5f9; border-radius: 999px; padding: 3px 10px;
  }
  .chip-time { background: #ede9fe; color: #6d28d9; font-weight: 700; }

  .themebox {
    border: 1px solid #ddd6fe; background: #faf5ff; border-radius: 10px;
    padding: 9px 13px; margin-bottom: 12px;
  }
  .themekey {
    font-size: 8pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: .6px; color: #7c3aed;
  }
  .themeval { font-size: 12.5px; margin-top: 2px; }

  .block { margin-bottom: 13px; break-inside: avoid; }
  .block h2 {
    font-size: 9pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: .7px; color: #64748b; margin: 0 0 6px;
  }

  table { width: 100%; border-collapse: collapse; }
  .k {
    width: 46%; padding: 6px 12px; font-size: 11.5px; color: #334155;
    border-bottom: 1px solid #f1f5f9; vertical-align: top;
  }
  .v {
    padding: 6px 12px; font-size: 12px; border-bottom: 1px solid #f1f5f9;
    vertical-align: top;
  }
  tr:last-child .k, tr:last-child .v { border-bottom: none; }
  table { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }

  .nm { font-weight: 600; }
  .none { color: #cbd5e1; font-style: italic; }
  .song { font-weight: 600; color: #6d28d9; }
  .note { font-size: 9.5px; color: #b45309; margin-top: 2px; line-height: 1.35; }

  /* Places: three to a row, so eight of them fit without a second page. */
  .place {
    display: inline-block; vertical-align: top; width: 32.4%;
    margin: 0 1.4% 7px 0; border: 1px solid #e2e8f0; border-radius: 10px;
    padding: 7px 11px; background: #fbfcfd; break-inside: avoid;
  }
  .place:nth-child(3n) { margin-right: 0; }
  .pl { font-size: 11px; font-weight: 700; color: #334155; }
  .names { margin-top: 3px; }
  .names > span { display: block; font-size: 11.5px; line-height: 1.5; }

  .foot {
    margin-top: 14px; padding-top: 7px; border-top: 1px solid #e2e8f0;
    display: flex; justify-content: flex-end;
    font-size: 8.5pt; color: #94a3b8;
  }
</style></head>
<body>
  <section class="page">
    <div class="pagehead">
      <h1>${esc(labels.title)}</h1>
      <div class="subtitle">${esc(congregationName)}</div>
      <div class="chips">
        <span class="chip">${esc(dateLabel)}</span>
        ${time ? `<span class="chip chip-time">${esc(time)}</span>` : ''}
        ${address ? `<span class="chip">${esc(address)}</span>` : ''}
      </div>
    </div>

    ${
      theme
        ? `<div class="themebox">
             <div class="themekey">${esc(labels.theme)}</div>
             <div class="themeval">${esc(theme)}</div>
           </div>`
        : ''
    }

    ${section(labels.programme, programmeRows ? `<table>${programmeRows}</table>` : '')}
    ${section(labels.duties, placeCards(duties))}

    <div class="foot">${esc(labels.printed)} ${esc(printedOn)}</div>
  </section>
</body></html>`;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
