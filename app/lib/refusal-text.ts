/**
 * A refusal of the server, in the reader's words (13 October 2026).
 *
 * The server says WHY by a code — `FS_PAST_LOCKED`, `WEEK_NOT_MONDAY` — and
 * keeps its English sentence beside it for the versions of the app already
 * on phones. Until now that English sentence was what people read: «A
 * service overseer's visit is to a group; choose the group.» in the middle
 * of a Russian screen. The code list lives on the server
 * (src/common/errors/refusal.ts); the words live here and in the locales,
 * and scripts/check-server-refusals.mjs fails when a code has none.
 *
 * Four kinds of answer:
 *   • a code with words of its own — `serverError.codes.<CODE>`, a date in
 *     it written the reader's way;
 *   • a field the request got wrong — its name, when the app has one for
 *     it, and the rule it broke;
 *   • «only these may do it» — the responsibilities or roles, by their
 *     names in the app;
 *   • «not found» with no code — always the same thing for a person: the
 *     record is gone, most likely deleted by someone else.
 * Anything else — a refusal not yet given a code — returns null, and the
 * caller shows the server's own sentence as before.
 *
 * Pure: no imports, so the gate runs it as it is.
 */

export type Say = (key: string, options?: Record<string, unknown>) => string;

export interface RefusalTools {
  say: Say;
  /** Whether the locales hold a key — a code may arrive before its words. */
  has: (key: string) => boolean;
  /** «10 октября» for an ISO day, in the reader's language. */
  day: (iso: string) => string;
  /** «сентябрь 2026» for an ISO month. */
  month: (ym: string) => string;
  /** The reader's language: Russian lists lower the first letter of a name. */
  lang: string;
}

type Body = {
  code?: unknown;
  fields?: unknown;
  responsibilities?: unknown;
  roles?: unknown;
  [k: string]: unknown;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

/** «Служебный старейшина» → «служебный старейшина» in a Russian list. */
function inList(name: string, lang: string): string {
  return lang === "ru"
    ? name.charAt(0).toLocaleLowerCase("ru") + name.slice(1)
    : name;
}

/** A field's name for a person, or null when the app has none for it. */
function fieldName(path: string, t: RefusalTools): string | null {
  // `slots.2.startTime` is named by its last part.
  const last =
    path
      .split(".")
      .filter((p) => !/^\d+$/.test(p))
      .pop() ?? path;
  const key = `serverError.fields.${last}`;
  return t.has(key) ? t.say(key) : null;
}

function ruleText(rules: string[], t: RefusalTools): string {
  for (const r of rules) {
    const key = `serverError.rules.${r}`;
    if (t.has(key)) return t.say(key);
  }
  return t.say("serverError.rules.other");
}

export function refusalText(
  status: number | undefined,
  data: unknown,
  t: RefusalTools,
): string | null {
  const body = (data && typeof data === "object" ? data : {}) as Body;
  const code = typeof body.code === "string" ? body.code : null;

  if (
    code === "INVALID_FIELD" &&
    Array.isArray(body.fields) &&
    body.fields.length > 0
  ) {
    const first = body.fields[0] as { field?: unknown; rules?: unknown };
    const rules = Array.isArray(first.rules) ? first.rules.map(String) : [];
    // A field the app never sends (`bogus`) is the app's own fault, not the
    // reader's: said plainly, without a name to look for.
    if (rules.includes("whitelistValidation"))
      return t.say("serverError.invalid.extra");
    const name =
      typeof first.field === "string" ? fieldName(first.field, t) : null;
    const rule = ruleText(rules, t);
    return name
      ? t.say("serverError.invalid.named", { field: name, rule })
      : t.say("serverError.invalid.anonymous", { rule });
  }

  if (code === "NEEDS_RESPONSIBILITY" && Array.isArray(body.responsibilities)) {
    const names = body.responsibilities.map((r) => {
      const key = `responsibilities.types.${String(r)}`;
      return inList(t.has(key) ? t.say(key) : String(r), t.lang);
    });
    return t.say("serverError.codes.NEEDS_RESPONSIBILITY", {
      who: names.join(", "),
    });
  }

  if (code === "NEEDS_ROLE" && Array.isArray(body.roles)) {
    const names = body.roles.map((r) => {
      const key = `profile.roles.${String(r)}`;
      return inList(t.has(key) ? t.say(key) : String(r), t.lang);
    });
    return t.say("serverError.codes.NEEDS_ROLE", { who: names.join(", ") });
  }

  if (code) {
    // The section's own words first, where a section had them before this
    // list existed (special events); then the shared ones.
    const key = [
      `serverError.codes.${code}`,
      `specialEvents.errors.${code}`,
    ].find((k) => t.has(k));
    if (key) {
      const params: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body)) {
        params[k] =
          typeof v !== "string"
            ? v
            : ISO_DAY.test(v)
              ? t.day(v)
              : ISO_MONTH.test(v)
                ? t.month(v)
                : v;
      }
      return t.say(key, params);
    }
  }

  if (status === 404) return t.say("serverError.notFound");
  return null;
}
