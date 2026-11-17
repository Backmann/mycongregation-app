import { api, type S21DataResponse } from './api';

/**
 * The folder for the circuit overseer — form S-61 (12/25), decided with
 * Lionel on 17 November 2026 (mockup «Папка для районного (S-61)»).
 *
 * The server keeps how the folder stands (server: co-visit-folder); the app
 * makes the files. Numbers are the form's own; 3.5 and 3.6 are the service
 * committee's addition. Contacts are in the file only, never on a screen.
 */

export type FolderRole = 'coordinator' | 'secretary' | 'service_overseer';
export type FolderMarkState = 'saved' | 'separate' | 'paper' | 'na';
export type FolderAnswer = 'yes' | 'no' | 'na';

export interface FolderGroupLine {
  key: string;
  groupId: string | null;
  name: string | null;
  people: number;
  state: FolderMarkState | null;
  markedAt: string | null;
  markedBy: string | null;
  changed: boolean;
  ready: boolean;
  stamp: string | null;
}

export interface FolderItem {
  key: string;
  section: 1 | 2 | 3;
  role: FolderRole;
  source: 'pdf' | 'manual';
  states: FolderMarkState[];
  extra: boolean;
  state: FolderMarkState | null;
  markedAt: string | null;
  markedBy: string | null;
  changed: boolean;
  ready: boolean;
  stamp: string | null;
  facts: Record<string, number | string | null>;
  groups?: FolderGroupLine[];
}

export interface FolderHints {
  since: string;
  sinceVisit: boolean;
  4: { pioneerEnded: string[]; pioneerMoved: string[] };
  5: { disfellowshipped: string[] };
  6: { died: string[] };
  9: { moved: string[] };
  12: { serviceYear: number; confirmed: number; total: number };
}

export interface CoFolder {
  visit: { id: string; date: string; endDate: string; overseer: string | null };
  today: string;
  access: { full: boolean; roles: FolderRole[] };
  dueOn: string;
  daysLeft: number;
  s62: {
    dueOn: string;
    sentAt: string | null;
    sentBy: string | null;
    checkedAt: string | null;
    checkedBy: string | null;
  };
  items: FolderItem[];
  byRole: { role: FolderRole; ready: number; total: number }[];
  ready: number;
  total: number;
  page2?: {
    total: number;
    answered: number;
    erasedAt: string | null;
    eraseOn: string;
    answers: Record<string, { answer: FolderAnswer; by: string | null; at: string }>;
    hints: FolderHints;
  };
  checks?: { lunchMissing: string[]; outingsWithoutPartner: string[] };
  handedOver?: { at: string; by: string | null } | null;
  deletions?: { userId: string; name: string | null; me: boolean; deletedAt: string | null }[];
}

export interface FolderContact {
  lastName: string;
  firstName: string;
  group: string | null;
  mobilePhone: string | null;
  email: string | null;
  address: string | null;
}

const base = (eventId: string) => `/co-visit-folder/${eventId}`;

export const coFolderApi = {
  get: async (eventId: string) => (await api.get<CoFolder>(base(eventId))).data,
  mark: async (eventId: string, key: string, state: FolderMarkState | null, stamp?: string | null) =>
    (
      await api.put<{ ok: boolean; changed?: boolean }>(
        `${base(eventId)}/marks/${encodeURIComponent(key)}`,
        stamp ? { state, stamp } : { state },
      )
    ).data,
  s62: async (eventId: string, what: 'sent' | 'checked', on: boolean) =>
    (await api.put<{ ok: boolean }>(`${base(eventId)}/s62`, { what, on })).data,
  answer: async (eventId: string, q: number, answer: FolderAnswer | null) =>
    (await api.put<{ ok: boolean; answered: number }>(`${base(eventId)}/answers/${q}`, { answer })).data,
  handOver: async (eventId: string, on: boolean) =>
    (await api.put<{ ok: boolean }>(`${base(eventId)}/handed-over`, { on })).data,
  filesDeleted: async (eventId: string) =>
    (await api.post<{ ok: boolean }>(`${base(eventId)}/files-deleted`, {})).data,
  s21: async (eventId: string, group: string) =>
    (
      await api.get<{ stamp: string | null; years: number[]; cards: S21DataResponse[][] }>(
        `${base(eventId)}/s21/${group}`,
      )
    ).data,
  contacts: async (eventId: string) =>
    (await api.get<{ stamp: string | null; people: FolderContact[] }>(`${base(eventId)}/contacts`)).data,
};

export {
  QUESTIONS,
  YES_NO_ONLY,
  optionsOf,
  HINTED,
  groupNumber,
  filterItems,
  toneOf,
  mayHandOver,
  fileName,
} from './co-folder-rules';
export type { FolderFilter, LineTone } from './co-folder-rules';
