import type { TFunction } from 'i18next';
import type { FieldServiceMeeting, FieldServiceProblem } from './api';

/**
 * What has gone wrong with a meeting since it was planned, in words
 * (24 October 2026): «Шмидт Петер в отъезде», «группа удалена». The server
 * says which (`attention`); the words are the reader's language. Null for a
 * meeting with nothing to say.
 */
export function attentionText(
  m: FieldServiceMeeting,
  t: TFunction,
  nameOf: (id: string | null | undefined) => string | null,
): string | null {
  const list = m.attention ?? [];
  if (list.length === 0) return null;
  const who = nameOf(m.conductorPublisherId) ?? t('fieldService.attention.theConductor');
  return list
    .map((p: FieldServiceProblem) => t(`fieldService.attention.${p}`, { who }))
    .join(' · ');
}

/** Meetings of a list that need a hand, soonest first. */
export function needingAttention(list: FieldServiceMeeting[]): FieldServiceMeeting[] {
  return list.filter((m) => (m.attention?.length ?? 0) > 0 && !m.cancelledAt && !m.movedTo);
}
