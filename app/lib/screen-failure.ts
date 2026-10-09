/**
 * «DID NOT LOAD» IS NOT «NOTHING THERE» (9 October 2026).
 *
 * A screen draws its list from `data ?? []`. When the request fails, that is
 * an empty list — and the screen says what it says about an empty list:
 * «Задач пока нет», «Пока нет докладчиков», «График на эту неделю ещё не
 * открыт» with a button to build it. An audit with the server switched off
 * (both roles, every screen, 8 October) found eight such screens telling a
 * brother something untrue, and twenty more where whole blocks vanished
 * without a word.
 *
 * The cure is one rule, applied where a screen asks for its MAIN data:
 *
 *   useQuery({ queryKey, queryFn, throwOnError: failsScreen })
 *
 * When that request could not reach the server — no answer, or the server
 * itself failing (5xx) — and there is nothing earlier to show, the query
 * throws, and the boundary that stands before every screen
 * (components/ScreenGate.tsx) draws «Не удалось загрузить» with «Повторить»
 * INSTEAD of the screen. A refusal (403), «not found» (404) and every other
 * answer of the server stay with the screen, exactly as before.
 *
 * NOT for the small things around a screen — a badge, a bell, a line on
 * «Главная»: losing one of those must not take the whole screen down. And
 * «Главная», «Мои назначения» and «Программа» keep what arrived last on the
 * device and say so themselves (lib/offline-keep.ts) — they are not marked.
 * scripts/check-screen-failure.mjs holds every screen to this.
 */
import type { Query } from '@tanstack/react-query';
import { sessionVerdict } from './session-verdict';

/** A request's error that came from the network layer (axios), not from code. */
export function isRequestError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { isAxiosError?: boolean }).isAxiosError === true;
}

// The query's type parameters do not matter here: only its state is read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function failsScreen(error: unknown, query: Query<any, any, any, any>): boolean {
  return query.state.data === undefined && isRequestError(error) && sessionVerdict(error) === 'unreachable';
}

/**
 * A line of a contents screen («Служение», «Собрание», «Профиль») that did
 * not come — by the same test as a screen: the request could not reach the
 * server and nothing earlier stands in. Such a line is left out (the row
 * keeps its plain description, or is not drawn); the screen says above that
 * it is not showing everything (components/ConnectionState.tsx, PartlyShown).
 * A refusal (403) is an answer: a line nobody may read is not «missing».
 */
export function lineMissing(q: { data: unknown; isError: boolean; error: unknown }): boolean {
  return q.isError && q.data === undefined && isRequestError(q.error) && sessionVerdict(q.error) === 'unreachable';
}

/** No answer at all, as opposed to the server answering with a failure. */
export function noAnswer(error: unknown): boolean {
  return isRequestError(error) && (error as { response?: unknown }).response === undefined;
}
