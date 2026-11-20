/**
 * The midweek meeting's guidelines, as rules — the app's copy of the
 * server's src/assignments/meeting-guidelines.ts (Lionel, 20 November 2026:
 * «если что-то расходится, то стоит сделать так, как указано»).
 *
 * The server refuses a save against them; here the pickers offer only who
 * may take the part. Both read the same examples of titles
 * (meeting-guidelines.fixtures.json), and the gate (scripts/check-meeting-
 * guidelines.mjs) fails when the two copies of the examples differ or this
 * file reads one of them otherwise.
 */

/** What a part of «Оттачиваем навыки служения» is, read off its title. */
export type MinistryKind =
  | 'start' //   «Начинайте разговор» — п. 7
  | 'follow' //  «Развивайте интерес» — п. 8
  | 'disciples' // «Подготавливайте учеников» — п. 10
  | 'explain' // «Объясняйте свои взгляды» as a demonstration — п. 11
  | 'talk' //    a student talk, «Речь», or «Объясняйте» as a talk — п. 11, 12
  | 'discussion' // led by an elder or servant, not a student part — п. 6, 9
  | 'unknown';

const has = (t: string, re: RegExp) => re.test(t);

/**
 * The kind of a ministry part from its title. Russian, German and English
 * headings: a rule that read Russian only would fall silent on any other
 * workbook. The import writes «<heading>: <first note>», and the FIRST
 * sentence of the note decides the delivery — «Речь.» makes «Объясняйте свои
 * взгляды» a talk, «Обсуждение.» makes any heading a discussion. Only that
 * sentence is read: «… О чём идёт речь в Библии» further on is no talk
 * (review of 20 November 2026), and quotes, brackets and dashes around the
 * word do not hide it.
 */
export function ministryKind(title: string | null | undefined): MinistryKind {
  const t = (title ?? '').trim().toLowerCase();
  if (!t) return 'unknown';
  // «<heading>: <note>» as the import writes it; an older hand-typed
  // «<heading>. <note>» is read the same way.
  const colonAt = t.indexOf(':');
  const colon = colonAt >= 0 ? colonAt : t.indexOf('.');
  const heading = (colon < 0 ? t : t.slice(0, colon)).trim();
  const note = colon < 0 ? '' : t.slice(colon + 1).trim();
  const bare = (x: string) =>
    x
      .replace(/[«»"„“”()[\]—–-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const first = bare(note.split(/[.!?;]/u)[0] ?? '');
  const head = bare(heading);
  const is = (re: RegExp) => re.test(first) || re.test(head);
  if (is(/^(?:обсуждение|besprechung|discussion)(?:\s|$)/u))
    return 'discussion';
  if (is(/^(?:речь|vortrag|talk)(?:\s|$)/u)) return 'talk';
  if (
    has(head, /начина\S* разговор|gespräch beginnen|starting a conversation/u)
  )
    return 'start';
  if (has(head, /развива\S* интерес|interesse fördern|following up/u))
    return 'follow';
  if (has(head, /подготавлива\S* учеников|jünger machen|making disciples/u))
    return 'disciples';
  if (
    has(
      head,
      /объясня\S* свои взгляды|glaubensansichten erklären|explaining your beliefs/u,
    )
  )
    return 'explain';
  return 'unknown';
}

/** «Местные потребности» — only an elder gives it (п. 16). */
export function isLocalNeeds(title: string | null | undefined): boolean {
  const t = (title ?? '').toLowerCase();
  return /местные потребности|örtliche bedürfnisse|local needs/u.test(t);
}

/** The capability that approves a student for this kind of part. */
export function studentCapability(
  partKey: string,
  title: string | null | undefined,
): string | null {
  if (partKey === 'bible_reading') return 'bible_reading';
  if (!partKey.startsWith('apply_yourself_')) return null;
  switch (ministryKind(title)) {
    case 'start':
      return 'fs_starting_conversation';
    case 'follow':
      return 'fs_following_up';
    case 'disciples':
      return 'fs_making_disciples';
    case 'explain':
      return 'fs_explaining_beliefs';
    case 'talk':
      return 'fs_talk';
    default:
      return null;
  }
}

export interface GuidelinePerson {
  gender: string | null;
  appointment: string | null;
  capabilities?: Record<string, boolean> | null;
}

export type GuidelineRefusal =
  | 'PART_NEEDS_BROTHER'
  | 'PART_NEEDS_ELDER'
  | 'PART_NEEDS_ELDER_OR_SERVANT'
  | 'PART_NO_ASSISTANT'
  | 'ASSISTANT_SAME_GENDER'
  | 'STUDENT_NOT_APPROVED';

const ELDER_OR_SERVANT = new Set<string>([
  'elder',
  'ministerial_servant',
]);

/** Parts given to an elder or a ministerial servant (п. 3, 4, 6, 9, 16, 17, 25). */
const ELDER_OR_SERVANT_PARTS = new Set([
  'midweek_chairman',
  'treasures_talk',
  'spiritual_gems',
  'cbs_conductor',
]);

/**
 * What the guidelines say against putting these people on this part, or null.
 *
 * `checkLead` / `checkAssistant` say who is NEW on the record: a save that
 * keeps the people it had (a time, a note, a title) is never refused, so a
 * part set up before these rules can still be edited (Lionel, 20 November
 * 2026 — the live programme had no case against them, but the rule must not
 * lock what it did not write).
 */
export function guidelineRefusal(
  partKey: string,
  title: string | null | undefined,
  lead: GuidelinePerson | null,
  assistant: GuidelinePerson | null,
  checkLead = true,
  checkAssistant = true,
  localNeeds = false,
): GuidelineRefusal | null {
  const brother = (p: GuidelinePerson) => p.gender !== 'sister';
  const appt = (p: GuidelinePerson) => String(p.appointment ?? '');

  if (partKey === 'bible_reading') {
    if (lead && checkLead && !brother(lead)) return 'PART_NEEDS_BROTHER';
  }
  if (ELDER_OR_SERVANT_PARTS.has(partKey)) {
    if (lead && checkLead && !ELDER_OR_SERVANT.has(appt(lead)))
      return 'PART_NEEDS_ELDER_OR_SERVANT';
  }
  if (partKey.startsWith('living_christians')) {
    if (lead && checkLead) {
      if (localNeeds || isLocalNeeds(title)) {
        if (appt(lead) !== 'elder')
          return 'PART_NEEDS_ELDER';
      } else if (!ELDER_OR_SERVANT.has(appt(lead))) {
        return 'PART_NEEDS_ELDER_OR_SERVANT';
      }
    }
  }
  if (partKey.startsWith('apply_yourself_')) {
    const kind = ministryKind(title);
    if (kind === 'discussion') {
      if (lead && checkLead && !ELDER_OR_SERVANT.has(appt(lead)))
        return 'PART_NEEDS_ELDER_OR_SERVANT';
      if (assistant && checkAssistant) return 'PART_NO_ASSISTANT';
    } else if (kind === 'talk') {
      if (lead && checkLead && !brother(lead)) return 'PART_NEEDS_BROTHER';
      if (assistant && checkAssistant) return 'PART_NO_ASSISTANT';
    } else if (lead && assistant && (checkLead || checkAssistant)) {
      // п. 7, 11: the same gender or one of the family — the family is the
      // elder's own word in the app, kept nowhere (Lionel, 20 November 2026).
      // п. 8, 10, and a part whose kind is not known: the same gender only.
      const familyAllowed = kind === 'start' || kind === 'explain';
      if (
        !familyAllowed &&
        lead.gender &&
        assistant.gender &&
        lead.gender !== assistant.gender
      )
        return 'ASSISTANT_SAME_GENDER';
    }
  }
  // п. 1: one who is not yet a publisher takes a student part once approved;
  // the approval is the mark of that part on his card (Lionel, 20 November).
  const cap = studentCapability(partKey, title);
  const unapproved = (p: GuidelinePerson | null, check: boolean) =>
    !!p &&
    check &&
    appt(p) === 'student' &&
    (!cap || !p.capabilities?.[cap]);
  if (
    (partKey === 'bible_reading' || partKey.startsWith('apply_yourself_')) &&
    (unapproved(lead, checkLead) || unapproved(assistant, checkAssistant))
  )
    return 'STUDENT_NOT_APPROVED';
  return null;
}

/** What the pickers of a part are allowed to offer. */
export interface PickerGuideline {
  /** The lead's gender, when the part is for brothers only. */
  leadGender?: 'brother';
  /** The lead's appointment must be one of these. */
  leadAppointments?: readonly string[];
  /** No assistant on this part at all. */
  noAssistant?: boolean;
  /** The assistant: the lead's gender only, or also one of the family. */
  assistant?: 'same' | 'same-or-family';
  /** A student (not yet a publisher) needs this mark; null — never offered. */
  studentCap: string | null;
}

/** The guideline for the pickers of one midweek part, or null for any other. */
export function pickerGuideline(
  partKey: string | null | undefined,
  title: string | null | undefined,
): PickerGuideline | null {
  const key = partKey ?? '';
  const ES: readonly string[] = ['elder', 'ministerial_servant'];
  if (key === 'bible_reading')
    return { leadGender: 'brother', studentCap: 'bible_reading' };
  if (ELDER_OR_SERVANT_PARTS.has(key))
    return { leadAppointments: ES, studentCap: null };
  if (key.startsWith('living_christians'))
    return {
      leadAppointments: isLocalNeeds(title) ? ['elder'] : ES,
      studentCap: null,
    };
  if (key.startsWith('apply_yourself_')) {
    const kind = ministryKind(title);
    const cap = studentCapability(key, title);
    if (kind === 'discussion')
      return { leadAppointments: ES, noAssistant: true, studentCap: null };
    if (kind === 'talk')
      return { leadGender: 'brother', noAssistant: true, studentCap: cap };
    return {
      assistant: kind === 'start' || kind === 'explain' ? 'same-or-family' : 'same',
      studentCap: cap,
    };
  }
  return null;
}
