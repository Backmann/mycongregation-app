/**
 * "Checked on <date> at <time> by <who>" — the one line that answers who
 * vouched for a publisher's contacts and when. Shared so the profile row, the
 * contacts screen and the publisher card word it identically.
 */
export function contactsCheckLine(
  t: (k: string, o?: Record<string, unknown>) => string,
  locale: string,
  confirmedAt: string | null | undefined,
  byName: string | null | undefined,
): string {
  if (!confirmedAt) return t('myContacts.neverConfirmed');
  const d = new Date(confirmedAt);
  const date = d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return byName
    ? t('myContacts.confirmedByAt', { date, time, name: byName })
    : t('myContacts.confirmedAtTime', { date, time });
}
