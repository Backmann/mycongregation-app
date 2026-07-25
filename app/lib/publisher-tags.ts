import i18n from './i18n';
import { isActivePermanentPioneer } from './pioneer-status';
import type { Publisher } from './api';

/**
 * The badges shown beside a name — appointment and pioneer service.
 *
 * Both the roster and a service group's composition show the same person, so
 * they must say the same things about him. This used to live only inside the
 * roster row, and the group screen said nothing at all.
 *
 * What a fellow publisher may see is deliberately narrow: what someone is
 * appointed to and how he pioneers. The «Неактивный» flag is bookkeeping about
 * a person's standing and stays with the elders — a name in a list is not the
 * place to publish it.
 */
export function publisherTags(
  publisher: Pick<Publisher, 'appointment' | 'pioneerType' | 'isActive'> & {
    pioneerSince?: string | null;
  },
  opts: { privileged: boolean; isAuxiliaryPioneer?: boolean },
): string[] {
  const tags: string[] = [];
  if (publisher.appointment === 'elder') {
    tags.push(i18n.t('publishers.tags.elder'));
  }
  if (publisher.appointment === 'ministerial_servant') {
    tags.push(i18n.t('publishers.tags.ms'));
  }

  // pioneerSince is a private field, so an ordinary publisher never receives
  // it; isActivePermanentPioneer treats a missing date as "already serving",
  // which is what keeps the pioneer badge honest for everyone.
  const permanent = isActivePermanentPioneer(
    publisher.pioneerType,
    publisher.pioneerSince,
  );
  if (permanent && publisher.pioneerType === 'regular') {
    tags.push(i18n.t('publishers.tags.regularPioneer'));
  }
  if (permanent && publisher.pioneerType === 'special') {
    tags.push(i18n.t('publishers.tags.specialPioneer'));
  }
  if (permanent && publisher.pioneerType === 'missionary') {
    tags.push(i18n.t('publishers.tags.missionary'));
  }
  // Auxiliary pioneering comes from the real service periods, and is only
  // worth saying when the person is not already a permanent pioneer.
  if (opts.isAuxiliaryPioneer && !permanent) {
    tags.push(i18n.t('publishers.tags.auxiliaryPioneer'));
  }

  if (opts.privileged && publisher.isActive === false) {
    tags.push(i18n.t('publishers.tags.inactive'));
  }
  return tags;
}
