import { useQuery } from '@tanstack/react-query';
import { songsApi } from './api';

const EMPTY: Map<number, string> = new Map();

/**
 * Map of song number -> title for the active song catalog. Cached for an hour
 * (the catalog changes rarely) and shared across all subscribers via the
 * react-query cache, so calling this in many rows triggers only one fetch.
 */
const NO_LENGTHS = new Map<number, number>();

/**
 * Each song's recording length in seconds (R-77, 22 November 2026), by
 * number — for the running meeting's forecast and its song cards.
 */
export function useSongLengths(): Map<number, number> {
  const { data } = useQuery({
    queryKey: ['songs', 'lengths'],
    queryFn: async () => {
      const res = await songsApi.list({ limit: 500 });
      const map = new Map<number, number>();
      for (const s of res.data) if (typeof s.durationSec === 'number') map.set(s.number, s.durationSec);
      return map;
    },
    staleTime: 1000 * 60 * 60,
  });
  return data ?? NO_LENGTHS;
}

export function useSongsMap(): Map<number, string> {
  const { data } = useQuery({
    queryKey: ['songs', 'map'],
    queryFn: async () => {
      const res = await songsApi.list({ limit: 500 });
      const map = new Map<number, string>();
      for (const s of res.data) map.set(s.number, s.title);
      return map;
    },
    staleTime: 1000 * 60 * 60,
  });
  return data ?? EMPTY;
}

/**
 * Appends the song title to a reference like "Песня 35" using the catalog,
 * producing "Песня 35 — Удостоверяйтесь…". Returns the input unchanged when it
 * has no song number or the number is not in the catalog.
 */
export function enrichSongRef(
  text: string | null | undefined,
  songTitles: Map<number, string>,
): string | null {
  if (!text) return text ?? null;
  const m = text.match(/(?:Песня|Song|Lied)\s*№?\s*(\d+)/i);
  if (!m) return text;
  const title = songTitles.get(parseInt(m[1], 10));
  return title ? `${text} — ${title}` : text;
}
