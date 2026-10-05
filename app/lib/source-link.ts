/**
 * The address behind «Открыть источник» — as a browser will take it.
 *
 * The field is typed or pasted by a person and stored as written; the server
 * asks only that it is text. «wol.jw.org/ru/…» without «https://» is the
 * usual slip, and the phone then refuses to open it — silently, so the link
 * looks dead. A value that is not an address at all (a few words, a page
 * number) is not offered as a link.
 *
 * Pure, so scripts/check-source-link.mjs runs it.
 */
export function sourceHref(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value || /\s/.test(value)) return null;
  if (/^https?:\/\//i.test(value)) return value;
  // Another scheme (mailto:, javascript:, a file) is not a source to open.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  // «wol.jw.org/…», «www.jw.org»: a host with a dot, then anything.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(value)) return `https://${value}`;
  return null;
}
