import dayjs from 'dayjs';
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import type { TFunction } from 'i18next';
import { pairPrepApi, PairPrepItem } from './api';

/**
 * «Договориться о подготовке» (10 November 2026) — what the app knows of the
 * pairs the reader is in, and how a moment is said.
 *
 * Names are never declined (the app has «Фамилия Имя» and nothing else), and
 * no verb takes the speaker's gender: «Белова Анна предлагает: …».
 */
export const PAIR_PREP_KEY = ['pair-prep', 'mine'] as const;

export function usePairPrep() {
  const q = useQuery({
    queryKey: PAIR_PREP_KEY,
    queryFn: () => pairPrepApi.mine(),
    // A screen keeps working without it: the block simply is not drawn.
    throwOnError: false,
    staleTime: 30_000,
  });
  // Back on the screen — from the partner's notification, another tab, the
  // phone's home screen — the answer may have come meanwhile. The app does
  // not refetch on focus by default; this small list does, at most every
  // fifteen seconds (react-query merges the blocks' calls into one).
  const { refetch, dataUpdatedAt } = q;
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - dataUpdatedAt > 15_000) void refetch();
    }, [refetch, dataUpdatedAt]),
  );
  return q;
}

/** The pair item of a programme row, by the row's `part:<id>`. */
export function pairOf(
  items: PairPrepItem[] | undefined,
  agendaId: string | undefined,
): PairPrepItem | null {
  if (!items || !agendaId?.startsWith('part:')) return null;
  const id = agendaId.slice('part:'.length);
  return items.find((i) => i.assignmentId === id) ?? null;
}

export interface Moment {
  kind: string;
  date: string | null;
  time: string | null;
  meeting: 'midweek' | 'weekend' | null;
}

/** «после встречи в выходной день» — inside a sentence. */
export function momentName(m: Moment, t: TFunction): string {
  if (m.kind === 'after') return t(`pairPrep.moment.after.${m.meeting ?? 'midweek'}`);
  return t(`pairPrep.moment.${m.kind}`);
}

/** The same, to stand at the head of a line. */
export function momentTitle(m: Moment, t: TFunction): string {
  const s = momentName(m, t);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «ср, 25 ноября» */
export function dayShort(iso: string, lang: string): string {
  return dayjs(iso).locale(lang).format('dd, D MMMM');
}

/** «вс, 22 ноября · начало в 10:00» — when the moment is. */
export function momentWhen(m: Moment, t: TFunction, lang: string): string {
  if (!m.date) return t('pairPrep.moment.selfHint');
  const day = dayShort(m.date, lang);
  if (m.kind === 'service') {
    return t('pairPrep.when.service', { day, time: m.time ?? '' });
  }
  return m.time ? t('pairPrep.when.meeting', { day, time: m.time }) : day;
}
