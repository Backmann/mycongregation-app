import { useQuery } from '@tanstack/react-query';
import { songsApi } from './api';

const EMPTY: Map<number, string> = new Map();

/**
 * Map of song number -> title for the active song catalog. Cached for an hour
 * (the catalog changes rarely) and shared across all subscribers via the
 * react-query cache, so calling this in many rows triggers only one fetch.
 */
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
