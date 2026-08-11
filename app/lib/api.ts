import axios, { AxiosError } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { storage } from './storage';
import type { ApplyParsedPayload } from './mwb-parser';

function resolveApiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (url) return url;
  if (__DEV__) {
    console.warn(
      '[api] EXPO_PUBLIC_API_URL not set; using http://localhost:3000/api (dev only)',
    );
    return 'http://localhost:3000/api';
  }
  throw new Error(
    'EXPO_PUBLIC_API_URL must be set for production builds. ' +
      'Add it to .env.production before running expo export.',
  );
}

const API_URL = resolveApiUrl();

/**
 * Where the tokens live.
 *
 * On the web the refresh token is no longer kept here at all — it travels in an
 * httpOnly cookie that the browser attaches to /api/auth by itself and that no
 * script can read. The access token stays in a plain variable rather than
 * localStorage: it lasts fifteen minutes and dies with the tab, so a cross-site
 * script has a small window instead of a month-long key to the account.
 *
 * The price is that a page reload starts with no token at all, so the app has
 * to exchange the cookie for a fresh one before it knows who you are — see the
 * silent restore in lib/auth.tsx.
 *
 * On a device none of this applies: expo-secure-store puts both tokens in the
 * Keychain/Keystore, which is stronger than any cookie, so that path is
 * untouched.
 */
const USE_COOKIE_AUTH = Platform.OS === 'web';

/** Web clients declare cookie mode; the server never has to guess. */
const AUTH_MODE_HEADER = 'X-Auth-Mode';

let memoryAccessToken: string | null = null;

async function getAccessToken(): Promise<string | null> {
  return USE_COOKIE_AUTH ? memoryAccessToken : storage.getItem(TOKEN_KEY);
}

async function setAccessToken(token: string): Promise<void> {
  if (USE_COOKIE_AUTH) {
    memoryAccessToken = token;
    return;
  }
  await storage.setItem(TOKEN_KEY, token);
}

export const TOKEN_KEY = 'mycongregation.token';
export const REFRESH_TOKEN_KEY = 'mycongregation.refresh_token';

/**
 * Decode JWT payload (no signature verification) to check if the token is
 * about to expire. Returns true if exp is within the buffer or if the token
 * is malformed (treat as expired so caller refreshes).
 */
function isTokenExpiringSoon(token: string, bufferSec = 180): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    if (typeof payload.exp !== 'number') return false;
    return Date.now() >= payload.exp * 1000 - bufferSec * 1000;
  } catch {
    return true;
  }
}

export const api = axios.create({
  baseURL: API_URL,
  timeout: 60_000,
  // Without this the browser would not attach the refresh cookie. It is
  // scoped to /api/auth, so it rides along with nothing else.
  withCredentials: USE_COOKIE_AUTH,
});

/**
 * Who we are, said outright instead of left to be guessed.
 *
 * A React Native app signs its requests `okhttp/4.x` and mentions no platform
 * at all — which is why «Управление пользователями» showed «Неизвестно ·
 * приложение» for every phone in the congregation. The server could not have
 * done better with what it was given; the fact was never in the string.
 *
 * The app version is the useful half: an administrator can see who is still on
 * an old build and needs help updating, rather than asking each brother.
 *
 * Nothing here identifies a device — no model, no serial, no advertising id.
 * A platform, its version, and our own build number.
 */
export const CLIENT_DESCRIPTION = [
  `platform=${
    Platform.OS === 'android'
      ? 'android'
      : Platform.OS === 'ios'
        ? 'ios'
        : Platform.OS === 'web'
          ? 'other'
          : 'other'
  }`,
  `kind=${Platform.OS === 'web' ? 'browser' : 'app'}`,
  `os=${String(Platform.Version ?? '')}`,
  `app=${Constants.expoConfig?.version ?? ''}`,
].join('; ');

api.interceptors.request.use(async (config) => {
  // Sent on every request, so a session started before this existed starts
  // describing itself the moment the app is opened again.
  config.headers.set('X-Client', CLIENT_DESCRIPTION);
  if (USE_COOKIE_AUTH && config.url?.includes('/auth/')) {
    config.headers.set(AUTH_MODE_HEADER, 'cookie');
  }
  let token = await getAccessToken();

  // Proactive refresh: if AT is close to expiry, refresh BEFORE sending the
  // request. This avoids the 401-then-refresh-then-retry round-trip that
  // causes brief UI flashes. Excludes /auth/* endpoints to avoid recursion.
  const isAuthEndpoint =
    config.url?.includes('/auth/refresh') ||
    config.url?.includes('/auth/login') ||
    config.url?.includes('/auth/bootstrap');

  if (token && !isAuthEndpoint && isTokenExpiringSoon(token)) {
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    try {
      token = await refreshPromise;
    } catch {
      // Keep old token; response interceptor will handle the resulting 401.
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------- Types ----------

export type UserRole = 'admin' | 'elder' | 'ministerial_servant' | 'publisher';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  congregationId: string;
  canViewPrivateData: boolean;
  /**
   * Whether this account may reach the platform-level backups. Sent as a
   * capability rather than as the underlying owner flag, which is deliberately
   * invisible: the interface only needs to know whether to offer the screen.
   * Absent on older responses, and absent means no.
   */
  canManageBackups?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  /** Absent in cookie mode — the server put it in an httpOnly cookie instead. */
  refreshToken?: string;
  user: AuthUser;
}

/**
 * Admin-side projection of a User account (Phase 1 RBAC).
 * Excludes sensitive fields (passwordHash) and soft-delete metadata.
 * Returned from the admin /users endpoints.
 */
export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  uiLanguage: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  online: boolean;
  createdAt: string;
  updatedAt: string;
  appointment: PublisherAppointment | null;
  /**
   * The publisher card this account speaks for, or null.
   *
   * Null means the person can sign in and then find every personal screen
   * closed — report, assignments, group all hang off the card.
   */
  publisherId: string | null;
  /**
   * Whether a password has ever been set.
   *
   * An account can be created and invited, and the invitation link is what
   * sets the password. Until then the person is told «Invalid credentials» —
   * the same words as a wrong password — and nobody could tell the two apart.
   */
  hasPassword: boolean;
  /**
   * What this person last signed in from — platform, app or browser, when.
   *
   * The question it answers is «кто ещё не поставил приложение»: on a browser
   * no push notification reaches him. Null until he signs in again — older
   * sessions never recorded it.
   */
  lastClient: {
    platform: 'android' | 'ios' | 'windows' | 'mac' | 'other';
    kind: 'app' | 'browser';
    /** OS version as the client stated it; null when it did not say. */
    os: string | null;
    /** Which build of ours; null in a browser. */
    appVersion: string | null;
    /** Whether that build is behind the one being handed out. */
    outdated: boolean | null;
    at: string | null;
  } | null;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: UserRole;
  uiLanguage?: string;
}

export type Gender = 'brother' | 'sister';
export type PublisherAppointment =
  | 'elder'
  | 'ministerial_servant'
  | 'publisher'
  | 'unbaptized_publisher'
  | 'student'
  | 'none';
export type SpiritualStatus = 'other_sheep' | 'anointed' | 'unknown';
export type PioneerType =
  | 'none'
  | 'regular'
  | 'special'
  | 'missionary';
export type RemovalReason = 'moved' | 'disfellowshipped' | 'died' | 'other';

export type Capabilities = Record<string, boolean>;

export interface Publisher {
  id: string;
  congregationId: string;
  userId: string | null;
  serviceGroupId: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  displayName: string;
  gender: Gender;
  birthDate: string | null;
  mobilePhone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  /** Computed status — present only for admins/elders (pastoral information). */
  status?: PublisherStatus;

  // Circumstances the annual report asks about — pastoral, so the server
  // omits them entirely for anyone who is not an admin or an elder.
  isDeaf?: boolean;
  isBlind?: boolean;
  isImprisoned?: boolean;
  appointment: PublisherAppointment;
  baptismDate: string | null;
  spiritualStatus: SpiritualStatus;
  ministryStartDate: string | null;
  pioneerType: PioneerType;
  /**
   * Whether a permanent pioneer's service has actually begun. Sent instead of
   * pioneerSince (which is private) to callers who may not see personal dates,
   * so a pioneer type starting next month is not read as "already serving".
   */
  pioneerActive?: boolean;
  pioneerSince: string | null;
  notes: string | null;
  capabilities: Capabilities;
  removalReason: RemovalReason | null;
  removedAt: string | null;
  removedNote: string | null;
  restoredAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lastEditedByName?: string | null;
  /** Whether the publisher serves as an auxiliary pioneer this month (card badge). */
  isAuxiliaryPioneerNow?: boolean;
  /** Yearly contact check: when confirmed, and by whom (self or secretary). */
  contactsConfirmedAt?: string | null;
  contactsConfirmedByUserId?: string | null;
  contactsConfirmedByName?: string | null;
}

export interface CreatePublisherInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: Gender;
  birthDate?: string;
  mobilePhone?: string;
  email?: string;
  address?: string;
  serviceGroupId?: string | null;
  userId?: string;
  isActive?: boolean;
  appointment?: PublisherAppointment;
  baptismDate?: string;
  spiritualStatus?: SpiritualStatus;
  ministryStartDate?: string;
  pioneerType?: PioneerType;
  pioneerSince?: string;
  notes?: string;
  // Circumstances the annual congregation report asks about. The server
  // sends these only to admins and elders.
  isDeaf?: boolean;
  isBlind?: boolean;
  isImprisoned?: boolean;
  capabilities?: Capabilities;
}
export type UpdatePublisherInput = Partial<CreatePublisherInput>;

export interface ServiceGroup {
  id: string;
  congregationId: string;
  name: string;
  overseerPublisherId: string | null;
  assistantPublisherId: string | null;
  /** Resolved by the server, independent of group membership. */
  overseer?: Publisher | null;
  assistant?: Publisher | null;
  meetingLocation: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface CreateServiceGroupInput {
  name: string;
  overseerPublisherId?: string | null;
  assistantPublisherId?: string | null;
  meetingLocation?: string;
  notes?: string;
}
export type UpdateServiceGroupInput = Partial<CreateServiceGroupInput>;

// ---------- Assignment types ----------

export type EventType =
  | 'midweek'
  | 'weekend'
  | 'cleaning'
  | 'av_duty'
  | 'public_witnessing';

export type AssignmentStatus = 'draft' | 'published' | 'cancelled';

export interface Assignment {
  id: string;
  congregationId: string;
  weekStartDate: string;
  eventType: EventType;
  partKey: string;
  partOrder: number;
  partTitle: string | null;
  partDurationMin: number | null;
  publisherId: string | null;
  assistantPublisherId: string | null;
  status: AssignmentStatus;
  notes: string | null;
  changedSincePublish: boolean;
  publicTalkId: string | null;
  speakerName: string | null;
  speakerCongregation: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  ruleWarnings?: {
    code: string;
    publisherName: string;
    partKey?: string;
    capability?: string;
  }[];
}

export interface CreateAssignmentInput {
  weekStartDate: string;
  eventType: EventType;
  partKey: string;
  partOrder?: number;
  partTitle?: string;
  partDurationMin?: number;
  publisherId?: string | null;
  assistantPublisherId?: string | null;
  status?: AssignmentStatus;
  notes?: string;
  publicTalkId?: string | null;
  speakerName?: string | null;
  speakerCongregation?: string | null;
}
export type UpdateAssignmentInput = Partial<CreateAssignmentInput>;

// ---------- Schedule import types ----------

export interface WeekImportSummary {
  weekStartDate: string;
  weekEndDate: string;
  biblePassage: string;
  created: number;
  updated: number;
  skipped: number;
}

export interface ImportResult {
  epubFile: string;
  year: number;
  weeksImported: number;
  partsCreated: number;
  partsUpdated: number;
  partsSkipped: number;
  unclassifiedParts: number;
  weeks: WeekImportSummary[];
  errors: string[];
  warnings: string[];
}

// ---------- Public talks types ----------

export interface PublicTalk {
  id: string;
  number: number;
  title: string;
  isActive: boolean;
  /** Last time this talk was given in the current congregation. */
  lastGivenAt: string | null;
  /** Speaker name (publisher full name or invited speaker name). */
  lastGivenBy: string | null;
  /** Nearest upcoming (current/future week) scheduled delivery, if any. */
  nextGivenAt: string | null;
  /** Speaker for the upcoming delivery (publisher or invited speaker name). */
  nextGivenBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePublicTalkInput {
  number: number;
  title: string;
  isActive?: boolean;
}
export type UpdatePublicTalkInput = Partial<CreatePublicTalkInput>;

// ---------- Songs types ----------

export interface Song {
  id: string;
  number: number;
  title: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSongInput {
  number: number;
  title: string;
  isActive?: boolean;
}
export type UpdateSongInput = Partial<CreateSongInput>;

export interface BulkImportResult {
  parsed: number;
  created: number;
  updated: number;
  unchanged: number;
  invalid: number;
  examples: Array<{ number: number; title: string }>;
}

// ---------- Service report types ----------

export interface ServiceReport {
  id: string;
  congregationId: string;
  publisherId: string;
  reportMonth: string;            // ISO date, always YYYY-MM-01
  servedThisMonth: boolean | null;
  hoursReported: number | null;
  bibleStudies: number;
  notes: string | null;
  submittedAt: string;
  submittedById: string | null;
  submittedByName?: string | null;
  submittedOnBehalfOf: boolean;
  lastEditedAt: string | null;
  lastEditedById: string | null;
  lastEditedByName: string | null;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SubmitServiceReportInput {
  reportMonth: string;            // YYYY-MM or YYYY-MM-DD
  /**
   * Optional: when an admin/elder submits on behalf of another publisher.
   * Omit (or set to caller's own publisher id) for self-submission.
   */
  publisherId?: string;
  servedThisMonth?: boolean;
  hoursReported?: number;
  bibleStudies?: number;
  notes?: string;
}

export interface UpdateServiceReportInput {
  servedThisMonth?: boolean;
  hoursReported?: number;
  bibleStudies?: number;
  notes?: string;
}

export interface AuditLogEntry {
  id: string;
  action: 'UPDATE' | 'CREATE' | 'DELETE';
  actorUserId: string;
  actorName: string | null;
  changedFields: string[];
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  createdAt: string;
}

export interface PublisherHistoryEntry {
  reportMonth: string;
  report:
    | (ServiceReport & { canEdit: boolean; lastEditedByName: string | null })
    | null;
}

export interface PublisherHistoryResponse {
  publisher: {
    id: string;
    displayName: string;
    status: PublisherStatus | null;
    statusManuallyOverridden: boolean;
    isPioneer: boolean;
    pioneerType: PioneerType;
    pioneerSince: string | null;
  };
  timeline: PublisherHistoryEntry[];
}

export interface GroupReportsResponse {
  reportMonth: string;
  scopeLabel: string;
  closed: boolean;
  myGroupId: string | null;
  publishers: GroupReportRow[];
}

export interface GroupReportRow {
  publisherId: string;
  displayName: string;
  groupId: string | null;
  groupName: string | null;
  isPioneer: boolean;
  consecutiveMissing: number;
  report: ServiceReport | null;
  canManage: boolean;
}

/**
 * 'auxiliary' is not a PioneerType: auxiliary pioneering is a period a
 * publisher serves, not a property of the publisher, so the server works it
 * out per month. The field keeps its old name for compatibility.
 */
export type ServiceSummaryCategoryKey = 'auxiliary' | PioneerType;

export interface ServiceReportSummaryCategory {
  pioneerType: ServiceSummaryCategoryKey;
  count: number;
  hours: number | null;
  bibleStudies: number;
}

export interface S21MonthRow {
  reportMonth: string;
  servedThisMonth: boolean | null;
  hoursReported: number | null;
  bibleStudies: number;
  notes: string | null;
  wasAuxiliaryPioneer: boolean;
}

export interface S21DataResponse {
  serviceYear: number;
  publisher: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string;
    gender: Gender;
    birthDate: string | null;
    baptismDate: string | null;
    spiritualStatus: SpiritualStatus;
    appointment: PublisherAppointment;
    pioneerType: PioneerType;
  };
  months: S21MonthRow[];
}

export interface ServiceYearSummary {
  serviceYear: number;
  firstMonth: string;
  lastMonth: string;
  totalHours: number;
  totalStudies: number;
  avgMonthlyPioneerReports: number;
  monthly: {
    reportMonth: string;
    hours: number;
    studies: number;
    reporters: number;
  }[];
}

/** Where the collection of the month's reports stands — the home card. */
export interface ReportCollection {
  reportMonth: string;
  scope: 'congregation' | 'group';
  expected: number;
  received: number;
  deadline: string;
  pastDeadline: boolean;
  closed: boolean;
}

export interface ServiceReportSummary {
  reportMonth: string;
  categories: ServiceReportSummaryCategory[];
  totalActivePublishers: number;
  totalInactivePublishers: number;
  averages: {
    pioneerHours: number;
    bibleStudies: number;
    submittedPct: number;
    activePct: number;
  };
  closed: boolean;
}

export interface ClosureStatus {
  reportMonth: string;
  closed: boolean;
  closedAt: string | null;
  canManage: boolean;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// ---------- Helpers ----------

function cleanPayload<T extends Record<string, any>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([_, v]) => v !== '' && v !== undefined),
  ) as Partial<T>;
}

// ---------- Endpoints ----------

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
    return data;
  },

  /**
   * Ends this device's session on the server. Best effort: if the call fails
   * we still clear the tokens locally, because the person asked to sign out.
   */
  async logout(refreshToken?: string): Promise<void> {
    try {
      await axios.post(
        `${API_URL}/auth/logout`,
        refreshToken ? { refreshToken } : {},
        {
          timeout: 10_000,
          // In cookie mode the browser carries the token and the server
          // clears the cookie in its reply — so this call matters more here
          // than it did before: without it the cookie would outlive the
          // sign-out.
          withCredentials: USE_COOKIE_AUTH,
          headers: USE_COOKIE_AUTH
            ? { [AUTH_MODE_HEADER]: 'cookie' }
            : undefined,
        },
      );
    } catch {
      // Offline or already expired — nothing more we can do from here.
    }
  },
  async me(): Promise<AuthUser> {
    const { data } = await api.get<AuthUser>('/auth/me');
    return data;
  },
  /**
   * Self-service password change (Phase 1 follow-up — all roles).
   * Server returns 400 BadRequest if currentPassword is incorrect (NOT 401,
   * so the response interceptor will not trigger a refresh/logout cycle).
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await api.patch('/auth/me/password', { currentPassword, newPassword });
  },
  /** Public: always resolves OK regardless of whether the email exists. */
  async forgotPassword(email: string): Promise<void> {
    await api.post('/auth/forgot-password', { email });
  },
  /** Public: sets a new password using a token from the reset email. */
  /**
   * Set a password from a link — and come back signed in.
   *
   * The server hands over a session here because it already knows who this
   * is: the link came from the person's own mailbox and the password is the
   * one he just chose. Sending him on to a sign-in form to type both again
   * was the whole first impression of the app for an invited brother.
   */
  async resetPassword(token: string, password: string): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/auth/reset-password', {
      token,
      password,
    });
    return data;
  },
};

/**
 * Admin user management (Phase 1 RBAC — every endpoint is admin-only on the server).
 * Mirrors UsersController in mycongregation-server.
 */
export const usersApi = {
  async list(): Promise<PublicUser[]> {
    const { data } = await api.get<PublicUser[]>('/users');
    return data;
  },
  async create(input: CreateUserInput): Promise<PublicUser> {
    const { data } = await api.post<PublicUser>('/users', cleanPayload(input));
    return data;
  },
  async updateRole(id: string, role: UserRole): Promise<PublicUser> {
    const { data } = await api.patch<PublicUser>(`/users/${id}/role`, { role });
    return data;
  },
  async deactivate(id: string): Promise<PublicUser> {
    const { data } = await api.patch<PublicUser>(`/users/${id}/deactivate`);
    return data;
  },
  async activate(id: string): Promise<PublicUser> {
    const { data } = await api.patch<PublicUser>(`/users/${id}/activate`);
    return data;
  },
  async resetPassword(id: string, password: string): Promise<void> {
    await api.post(`/users/${id}/reset-password`, { password });
  },
  /** Point an account at a publisher card, or clear the link with null. */
  async linkPublisher(
    id: string,
    publisherId: string | null,
  ): Promise<PublicUser> {
    const { data } = await api.patch<PublicUser>(`/users/${id}/publisher`, {
      publisherId,
    });
    return data;
  },
};

export type ResponsibilityType =
  | 'body_coordinator'
  | 'life_ministry_overseer'
  | 'wt_study_conductor'
  | 'wt_study_conductor_backup'
  | 'public_talk_coordinator'
  | 'adviser'
  | 'secretary'
  | 'service_overseer'
  | 'service_overseer_assistant'
  | 'accounts_servant'
  | 'public_witnessing'
  | 'cleaning_coordinator'
  | 'duties_coordinator'
  | 'attendance_recorder';

export interface Responsibility {
  id: string;
  congregationId: string;
  type: ResponsibilityType;
  userId: string;
  assignedBy: string | null;
  assignedAt: string;
}

export const responsibilitiesApi = {
  async list(): Promise<Responsibility[]> {
    const { data } = await api.get<Responsibility[]>('/responsibilities');
    return data;
  },
  async assign(input: {
    type: ResponsibilityType;
    userId: string;
  }): Promise<Responsibility> {
    const { data } = await api.post<Responsibility>(
      '/responsibilities',
      input,
    );
    return data;
  },
  async revoke(type: ResponsibilityType, userId: string): Promise<void> {
    await api.delete(`/responsibilities/${type}/${userId}`);
  },
};

export interface MeetingSettingsVersion {
  id: string;
  congregationId: string;
  effectiveFrom: string;
  midweekDow: number;
  midweekTime: string;
  weekendDow: number;
  weekendTime: string;
  address: string;
  microphoneSlots: number;
}

export interface MeetingSettingsOverview {
  congregation: {
    id: string;
    name: string;
    timezone: string | null;
    assignmentAutomationEnabled: boolean;
  };
  versions: MeetingSettingsVersion[];
  effective: MeetingSettingsVersion | null;
}

export interface UpsertMeetingSettingsInput {
  effectiveFrom: string;
  midweekDow: number;
  midweekTime: string;
  weekendDow: number;
  weekendTime: string;
  address: string;
  microphoneSlots?: number;
}

export const meetingSettingsApi = {
  async getOverview(): Promise<MeetingSettingsOverview> {
    const { data } = await api.get<MeetingSettingsOverview>('/meeting-settings');
    return data;
  },
  async updateCongregation(input: {
    name?: string;
    timezone?: string;
    assignmentAutomationEnabled?: boolean;
  }): Promise<void> {
    await api.patch('/meeting-settings/congregation', input);
  },
  async upsertVersion(
    input: UpsertMeetingSettingsInput,
  ): Promise<MeetingSettingsVersion> {
    const { data } = await api.post<MeetingSettingsVersion>(
      '/meeting-settings',
      input,
    );
    return data;
  },
  async removeVersion(id: string): Promise<void> {
    await api.delete(`/meeting-settings/${id}`);
  },
};

export type DutyType =
  | 'security'
  | 'attendant'
  | 'microphone'
  | 'av'
  | 'zoom'
  | 'stage'
  | 'ventilation'
  | 'custom';

export type DutyWarning =
  | 'already_on_duty'
  | 'has_program_part'
  | 'capability_off';

export interface Duty {
  id: string;
  congregationId: string;
  weekStartDate: string;
  eventType: EventType;
  dutyType: DutyType;
  slotIndex: number;
  customLabel: string | null;
  publisherId: string | null;
  notes: string | null;
}

export interface DutyWithWarnings {
  duty: Duty;
  warnings: DutyWarning[];
}

export interface ActivityItem {
  weekStartDate: string;
  eventType: string;
  kind: 'part' | 'duty';
  partKey?: string;
  partTitle?: string | null;
  role?: 'primary' | 'assistant';
  dutyType?: string;
  slotIndex?: number;
  customLabel?: string | null;
}

export interface PublisherActivity {
  publisherId: string;
  items: ActivityItem[];
}

export interface PartSuggestion {
  publisherId: string;
  /** Last week (before the target week) they led one of the parts. */
  lastPrimaryAt: string | null;
  /** Last week they assisted on one of the parts. */
  lastAssistantAt: string | null;
  /** Most recent distinct assistants when they led (newest first, max 3). */
  recentAssistants: { publisherId: string; weekStartDate: string }[];
}

export const publisherActivityApi = {
  async getActivity(params: {
    weekStart: string;
    weeks?: number;
  }): Promise<PublisherActivity[]> {
    const { data } = await api.get('/publisher-activity', { params });
    return data;
  },
  async getSuggestions(params: {
    weekStart: string;
    partKeys: string[];
    weeks?: number;
  }): Promise<PartSuggestion[]> {
    const { data } = await api.get('/publisher-activity/suggestions', {
      params: {
        weekStart: params.weekStart,
        partKeys: params.partKeys.join(','),
        weeks: params.weeks,
      },
    });
    return data;
  },
};

export interface Hall {
  id: string;
  name: string;
  address: string;
  isDefault: boolean;
}

export const hallsApi = {
  async list(): Promise<Hall[]> {
    const { data } = await api.get<Hall[]>('/halls');
    return data;
  },
  async create(input: {
    name: string;
    address: string;
    isDefault?: boolean;
  }): Promise<Hall> {
    const { data } = await api.post<Hall>('/halls', input);
    return data;
  },
  async update(
    id: string,
    input: { name?: string; address?: string; isDefault?: boolean },
  ): Promise<Hall> {
    const { data } = await api.patch<Hall>(`/halls/${id}`, input);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/halls/${id}`);
  },
};

// ---- Public talk coordinator: external congregations + visiting speakers ----
export interface ExternalCongregation {
  id: string;
  name: string;
  city: string | null;
  contactName: string | null;
  contactPhone: string | null;
  note: string | null;
  address: string | null;
  meetingDow: number | null;
  meetingTime: string | null;
  mapUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VisitingSpeaker {
  id: string;
  firstName: string;
  lastName: string | null;
  externalCongregationId: string | null;
  externalCongregation: ExternalCongregation | null;
  phone: string | null;
  note: string | null;
  talkNumbers: number[];
  createdAt: string;
  updatedAt: string;
}

export const externalCongregationsApi = {
  async list(): Promise<ExternalCongregation[]> {
    const { data } = await api.get<ExternalCongregation[]>(
      '/external-congregations',
    );
    return data;
  },
  async create(input: {
    name: string;
    city?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
    note?: string | null;
    address?: string | null;
    meetingDow?: number | null;
    meetingTime?: string | null;
    mapUrl?: string | null;
  }): Promise<ExternalCongregation> {
    const { data } = await api.post<ExternalCongregation>(
      '/external-congregations',
      input,
    );
    return data;
  },
  async update(
    id: string,
    input: Partial<{
      name: string;
      city: string | null;
      contactName: string | null;
      contactPhone: string | null;
      note: string | null;
      address: string | null;
      meetingDow: number | null;
      meetingTime: string | null;
      mapUrl: string | null;
    }>,
  ): Promise<ExternalCongregation> {
    const { data } = await api.patch<ExternalCongregation>(
      `/external-congregations/${id}`,
      input,
    );
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/external-congregations/${id}`);
  },
};

export const visitingSpeakersApi = {
  async list(): Promise<VisitingSpeaker[]> {
    const { data } = await api.get<VisitingSpeaker[]>('/visiting-speakers');
    return data;
  },
  async create(input: {
    firstName: string;
    lastName?: string | null;
    externalCongregationId?: string | null;
    phone?: string | null;
    note?: string | null;
    talkNumbers?: number[];
  }): Promise<VisitingSpeaker> {
    const { data } = await api.post<VisitingSpeaker>(
      '/visiting-speakers',
      input,
    );
    return data;
  },
  async update(
    id: string,
    input: Partial<{
      firstName: string;
      lastName: string | null;
      externalCongregationId: string | null;
      phone: string | null;
      note: string | null;
      talkNumbers: number[];
    }>,
  ): Promise<VisitingSpeaker> {
    const { data } = await api.patch<VisitingSpeaker>(
      `/visiting-speakers/${id}`,
      input,
    );
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/visiting-speakers/${id}`);
  },
};

// ---- Public talk exchange log (incoming + outgoing) ----
export type TalkExchangeDirection = 'incoming' | 'outgoing';
export type TalkExchangeStatus = 'tentative' | 'confirmed';

export interface TalkExchange {
  id: string;
  direction: TalkExchangeDirection;
  date: string;
  status: TalkExchangeStatus;
  publicTalkId: string | null;
  visitingSpeakerId: string | null;
  speakerName: string | null;
  speakerCongregation: string | null;
  hospitalityPublisherId: string | null;
  publisherId: string | null;
  hostCongregationId: string | null;
  linkedAbsenceId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  /** Transient: set on create/update when an occupied program slot was not overwritten. */
  programConflict?: boolean;
}

export interface TalkExchangeInput {
  direction: TalkExchangeDirection;
  date: string;
  status?: TalkExchangeStatus;
  publicTalkId?: string | null;
  visitingSpeakerId?: string | null;
  speakerName?: string | null;
  speakerCongregation?: string | null;
  hospitalityPublisherId?: string | null;
  publisherId?: string | null;
  hostCongregationId?: string | null;
  note?: string | null;
  overwriteProgram?: boolean;
}

export const talkExchangeApi = {
  async list(): Promise<TalkExchange[]> {
    const { data } = await api.get<TalkExchange[]>('/talk-exchange');
    return data;
  },
  async create(input: TalkExchangeInput): Promise<TalkExchange> {
    const { data } = await api.post<TalkExchange>('/talk-exchange', input);
    return data;
  },
  async update(
    id: string,
    input: Partial<TalkExchangeInput>,
  ): Promise<TalkExchange> {
    const { data } = await api.patch<TalkExchange>(`/talk-exchange/${id}`, input);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/talk-exchange/${id}`);
  },
};

export const dutiesApi = {
  async setMicrophoneSlots(microphoneSlots: number): Promise<void> {
    await api.patch('/duties/microphone-slots', { microphoneSlots });
  },
  async list(
    params: { weekStart?: string; weekEnd?: string; eventType?: EventType } = {},
  ): Promise<Duty[]> {
    const { data } = await api.get<Duty[]>('/duties', { params });
    return data;
  },
  async generate(input: {
    weekStartDate: string;
    eventType: EventType;
  }): Promise<Duty[]> {
    const { data } = await api.post<Duty[]>('/duties/generate', input);
    return data;
  },
  async assign(
    id: string,
    input: { publisherId: string | null; notes?: string },
  ): Promise<DutyWithWarnings> {
    const { data } = await api.patch<DutyWithWarnings>(
      `/duties/${id}/assign`,
      input,
    );
    return data;
  },
  async createCustom(input: {
    weekStartDate: string;
    eventType: EventType;
    customLabel: string;
    publisherId?: string | null;
  }): Promise<DutyWithWarnings> {
    const { data } = await api.post<DutyWithWarnings>('/duties/custom', input);
    return data;
  },
  async removeDuty(id: string): Promise<void> {
    await api.delete(`/duties/${id}`);
  },
};

export interface FieldServiceMeeting {
  id: string;
  congregationId: string;
  weekStartDate: string;
  dayOfWeek: number; // 1=Mon .. 7=Sun
  startTime: string; // "HH:MM"
  address: string;
  conductorPublisherId: string | null;
  topic: string | null;
  sourceUrl: string | null;
  isGeneral: boolean;
  /** Whose meeting this is; null when it belongs to no one group. */
  serviceGroupId: string | null;
  /** The service overseer is visiting this group's meeting. */
  serviceOverseerVisit: boolean;
  serviceOverseerPublisherId: string | null;
  serviceOverseerAssistantId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFieldServiceMeetingInput {
  weekStartDate: string;
  dayOfWeek: number;
  startTime: string;
  address: string;
  conductorPublisherId?: string | null;
  topic?: string | null;
  sourceUrl?: string | null;
  isGeneral?: boolean;
  serviceGroupId?: string | null;
  serviceOverseerVisit?: boolean;
  serviceOverseerPublisherId?: string | null;
  serviceOverseerAssistantId?: string | null;
  /** When false, the conductor is not push-notified about this change. */
  notifyConductor?: boolean;
}

export type UpdateFieldServiceMeetingInput = Partial<
  Omit<CreateFieldServiceMeetingInput, 'weekStartDate'>
>;

export const fieldServiceApi = {
  async list(
    params: { weekStart?: string } = {},
  ): Promise<FieldServiceMeeting[]> {
    const { data } = await api.get<FieldServiceMeeting[]>(
      '/field-service-meetings',
      { params },
    );
    return data;
  },
  async create(
    input: CreateFieldServiceMeetingInput,
  ): Promise<FieldServiceMeeting> {
    const { data } = await api.post<FieldServiceMeeting>(
      '/field-service-meetings',
      input,
    );
    return data;
  },
  async update(
    id: string,
    input: UpdateFieldServiceMeetingInput,
  ): Promise<FieldServiceMeeting> {
    const { data } = await api.patch<FieldServiceMeeting>(
      `/field-service-meetings/${id}`,
      input,
    );
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/field-service-meetings/${id}`);
  },
};

export interface ConductorStat {
  conductorPublisherId: string;
  total: number;
  lastDate: string | null;
  nextDate: string | null;
}

export interface TopicHistoryEntry {
  topic: string;
  lastDate: string;
}

export const fieldServiceStatsApi = {
  async conductorStats(): Promise<ConductorStat[]> {
    const { data } = await api.get<ConductorStat[]>(
      '/field-service-meetings/conductor-stats',
    );
    return data;
  },
  async topicHistory(): Promise<TopicHistoryEntry[]> {
    const { data } = await api.get<TopicHistoryEntry[]>(
      '/field-service-meetings/topic-history',
    );
    return data;
  },
};

export interface FieldServiceMonthTheme {
  id: string;
  congregationId: string;
  year: number;
  month: number; // 1-12
  theme: string;
}

export const fieldServiceMonthThemeApi = {
  async list(): Promise<FieldServiceMonthTheme[]> {
    const { data } = await api.get<FieldServiceMonthTheme[]>(
      '/field-service-month-themes',
    );
    return data;
  },
  async upsert(input: {
    year: number;
    month: number;
    theme: string;
  }): Promise<FieldServiceMonthTheme | null> {
    const { data } = await api.put<FieldServiceMonthTheme | null>(
      '/field-service-month-themes',
      input,
    );
    return data;
  },
};

export interface FieldServiceTemplateSlot {
  id: string;
  congregationId: string;
  position: number;
  ordinal: number; // 1-5
  dayOfWeek: number; // 1=Mon..7=Sun
  startTime: string; // "HH:MM"
  address: string;
}

export interface TemplateSlotInput {
  ordinal: number;
  dayOfWeek: number;
  startTime: string;
  address: string;
}

export const fieldServiceTemplateApi = {
  async getSlots(): Promise<FieldServiceTemplateSlot[]> {
    const { data } = await api.get<FieldServiceTemplateSlot[]>(
      '/field-service-template',
    );
    return data;
  },
  async replaceSlots(
    slots: TemplateSlotInput[],
  ): Promise<FieldServiceTemplateSlot[]> {
    const { data } = await api.put<FieldServiceTemplateSlot[]>(
      '/field-service-template',
      { slots },
    );
    return data;
  },
  async generate(input: {
    startYear: number;
    startMonth: number;
    months: number;
  }): Promise<{ created: number; skipped: number }> {
    const { data } = await api.post<{ created: number; skipped: number }>(
      '/field-service-template/generate',
      input,
    );
    return data;
  },
};

export type CleaningSlotType = 'after_meeting' | 'thorough' | 'general';

export interface CleaningAssignment {
  id: string;
  congregationId: string;
  weekStartDate: string;
  slotType: CleaningSlotType;
  serviceGroupId: string | null;
  /** Hall-plan window numbers for the weekly thorough cleaning. */
  windows: number[] | null;
  /** When the assigned group plans to do the thorough cleaning (ISO). */
  thoroughPlannedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CleaningWeek {
  assignments: CleaningAssignment[];
  suggestedAfterMeetingGroupId: string | null;
}

export const cleaningApi = {
  async getWeek(weekStart: string): Promise<CleaningWeek> {
    const { data } = await api.get<CleaningWeek>('/cleaning', {
      params: { weekStart },
    });
    return data;
  },
  async setSlot(input: {
    weekStartDate: string;
    slotType: CleaningSlotType;
    serviceGroupId?: string | null;
    windows?: number[] | null;
  }): Promise<CleaningAssignment> {
    const { data } = await api.put<CleaningAssignment>('/cleaning', input);
    return data;
  },
  /** Set (or clear with null) the day the group plans the thorough cleaning. */
  async planThorough(input: {
    weekStartDate: string;
    plannedAt: string | null;
  }): Promise<CleaningAssignment> {
    const { data } = await api.patch<CleaningAssignment>(
      '/cleaning/thorough-plan',
      input,
    );
    return data;
  },
  /** Set (or clear) the date/time of the general cleaning (coordinator only). */
  async planGeneral(input: {
    weekStartDate: string;
    plannedAt: string | null;
  }): Promise<CleaningAssignment> {
    const { data } = await api.patch<CleaningAssignment>(
      '/cleaning/general-plan',
      input,
    );
    return data;
  },
  async clearSlot(
    weekStartDate: string,
    slotType: CleaningSlotType,
  ): Promise<void> {
    await api.delete('/cleaning', { params: { weekStartDate, slotType } });
  },
};

export type CartLocationKind = 'cart' | 'stand';

export interface CartLocation {
  id: string;
  congregationId: string;
  name: string;
  address: string | null;
  kind: CartLocationKind;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCartLocationInput {
  name: string;
  address?: string | null;
  kind?: CartLocationKind;
  isActive?: boolean;
}

export type UpdateCartLocationInput = Partial<CreateCartLocationInput>;

export const cartLocationsApi = {
  async list(includeInactive = false): Promise<CartLocation[]> {
    const { data } = await api.get<CartLocation[]>('/cart-locations', {
      params: includeInactive ? { includeInactive: 'true' } : {},
    });
    return data;
  },
  async create(input: CreateCartLocationInput): Promise<CartLocation> {
    const { data } = await api.post<CartLocation>('/cart-locations', input);
    return data;
  },
  async update(
    id: string,
    input: UpdateCartLocationInput,
  ): Promise<CartLocation> {
    const { data } = await api.patch<CartLocation>(
      `/cart-locations/${id}`,
      input,
    );
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/cart-locations/${id}`);
  },
};

export interface CoVisitItem {
  id: string;
  kind: string;
  forWife: boolean;
  withWife: boolean;
  itemDate: string;
  startTime: string | null;
  placeKind: string | null;
  cartLocationId: string | null;
  cartLocationName: string | null;
  placeText: string | null;
  assigneePublisherId: string | null;
  assigneeName: string | null;
  assigneePhone: string | null;
  assigneeAddress: string | null;
  assigneeText: string | null;
  note: string | null;
  sortOrder: number;
}

export interface CoVisitItemInput {
  specialEventId?: string;
  kind?: string;
  forWife?: boolean;
  withWife?: boolean;
  itemDate?: string;
  startTime?: string | null;
  placeKind?: string | null;
  cartLocationId?: string | null;
  placeText?: string | null;
  assigneePublisherId?: string | null;
  assigneeText?: string | null;
  note?: string | null;
  sortOrder?: number;
}

export interface MyCoVisitItem extends CoVisitItem {
  serviceWith?: 'co' | 'wife' | 'joint';
}

export interface MyCoVisit {
  visit: { id: string; title: string; date: string; endDate: string | null };
  items: MyCoVisitItem[];
}

export interface CoHostStat {
  publisherId: string;
  kind: string;
  total: number;
  lastDate: string | null;
  nextDate: string | null;
}

/**
 * The field-service meetings of an upcoming circuit-overseer visit, as
 * everyone may see them. During a visit that week's field service is planned
 * in the visit schedule rather than the regular section, and the full item
 * list is elder-only (it also holds hosts, addresses and phones) — so the
 * server exposes just when and where. NOT who is assigned: on a visit item
 * that is the brother going out in service WITH the overseer, not a conductor.
 */
export interface CoVisitFieldServiceMeeting {
  id: string;
  itemDate: string;
  startTime: string | null;
  place: string | null;
}

export interface CoVisitFieldServiceWeek {
  visit: { id: string; title: string; date: string; endDate: string | null };
  meetings: CoVisitFieldServiceMeeting[];
}

export const coVisitItemsApi = {
  /** Hosting rotation across all visits (lunches / lunch boxes). */
  async hostStats(): Promise<CoHostStat[]> {
    const { data } = await api.get<CoHostStat[]>('/co-visit-items/host-stats');
    return data;
  },

  /** The signed-in member's own slice of upcoming CO visits (any role). */
  async mine(): Promise<MyCoVisit[]> {
    const { data } = await api.get<MyCoVisit[]>('/co-visit-items/mine');
    return data;
  },
  /** Field-service meetings of upcoming visits — visible to everyone. */
  async fieldService(): Promise<CoVisitFieldServiceWeek[]> {
    const { data } = await api.get<CoVisitFieldServiceWeek[]>(
      '/co-visit-items/field-service',
    );
    return data;
  },
  async list(specialEventId: string): Promise<CoVisitItem[]> {
    const { data } = await api.get<CoVisitItem[]>('/co-visit-items', {
      params: { specialEventId },
    });
    return data;
  },
  async create(input: CoVisitItemInput): Promise<CoVisitItem> {
    const { data } = await api.post<CoVisitItem>('/co-visit-items', input);
    return data;
  },
  async update(id: string, input: CoVisitItemInput): Promise<CoVisitItem> {
    const { data } = await api.patch<CoVisitItem>(
      `/co-visit-items/${id}`,
      input,
    );
    return data;
  },
  /** Put a removed item back — the same right as removing it. */
  async restore(id: string): Promise<void> {
    await api.post(`/co-visit-items/${id}/restore`);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/co-visit-items/${id}`);
  },
};


export type CartWeekStatus = 'draft' | 'collecting' | 'published';

export interface PartnerHint {
  partnerId: string;
  name: string;
  count: number;
  lastDate: string;
}

export interface CartAssignmentView {
  id: string;
  publisherId: string | null;
  name: string;
  gender: Gender | null;
  external: boolean;
}

export interface CartRequestView {
  publisherId: string;
  name: string;
  withWhomNote: string | null;
}

export interface SlotWarnings {
  underMin: boolean;
  brotherSister: boolean;
  secondShiftSameDay: boolean;
}

export interface CartSlotView {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  locationId: string;
  locationName: string;
  locationKind: CartLocationKind;
  capacityMax: number;
  myRequest: boolean;
  myAssignment?: boolean;
  assignedCount?: number;
  requestCount?: number;
  assignments?: CartAssignmentView[];
  requests?: CartRequestView[];
  warnings?: SlotWarnings;
}

export interface CartWeekView {
  id: string;
  weekStartDate: string;
  status: CartWeekStatus;
  startTime: string;
  endTime: string;
  stepMinutes: number;
  slots: CartSlotView[];
}

export interface BuildCartWeekInput {
  weekStartDate: string;
  startTime: string;
  endTime: string;
  stepMinutes: number;
  daysOfWeek: number[];
  locationIds: string[];
}

export const cartWeeksApi = {
  async getWeek(weekStart: string): Promise<CartWeekView | null> {
    const { data } = await api.get<CartWeekView | null>('/cart-weeks', {
      params: { weekStart },
    });
    return data || null;
  },
  async build(input: BuildCartWeekInput): Promise<{ id: string }> {
    const { data } = await api.post<{ id: string }>('/cart-weeks', input);
    return data;
  },
  async open(id: string): Promise<void> {
    await api.post(`/cart-weeks/${id}/open`);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/cart-weeks/${id}`);
  },
  async apply(slotId: string, withWhomNote?: string): Promise<void> {
    await api.post(
      `/cart-slots/${slotId}/request`,
      withWhomNote ? { withWhomNote } : {},
    );
  },
  async withdraw(slotId: string): Promise<void> {
    await api.delete(`/cart-slots/${slotId}/request`);
  },
  async publish(id: string): Promise<void> {
    await api.post(`/cart-weeks/${id}/publish`);
  },
  async assign(
    slotId: string,
    body: { publisherId?: string; externalName?: string },
  ): Promise<void> {
    await api.post(`/cart-slots/${slotId}/assignments`, body);
  },
  async unassign(slotId: string, assignmentId: string): Promise<void> {
    await api.delete(`/cart-slots/${slotId}/assignments/${assignmentId}`);
  },
  async pairings(weeks?: number): Promise<Record<string, PartnerHint[]>> {
    const { data } = await api.get<Record<string, PartnerHint[]>>(
      '/cart-weeks/pairings',
      { params: weeks ? { weeks } : {} },
    );
    return data;
  },
  async cancelMine(slotId: string): Promise<void> {
    await api.delete(`/cart-slots/${slotId}/my-assignment`);
  },
};

export type PublisherStatus = 'active' | 'irregular' | 'inactive';

export interface AccessSummary {
  hasAccess: boolean;
  email: string | null;
  role: 'admin' | 'elder' | 'ministerial_servant' | 'publisher' | null;
  isActive: boolean | null;
  lastLoginAt: string | null;
  canViewPrivateData: boolean | null;
}

export interface GrantAccessInput {
  email?: string;
  password?: string;
  isAdmin?: boolean;
  /** When true, create the account without a password and email an
   * invitation link so the person sets their own password. */
  sendInvite?: boolean;
}

export interface UpdateAccessInput {
  /** New login email — e.g. to fix a typo. Must be unique. */
  email?: string;
  password?: string;
  isAdmin?: boolean;
  isActive?: boolean;
  canViewPrivateData?: boolean;
}

export const publishersApi = {
  /** "These contacts are still correct" — for a publisher who doesn't use the app. */
  async confirmContacts(id: string): Promise<Publisher> {
    const { data } = await api.post<Publisher>(`/publishers/${id}/contacts/confirm`);
    return data;
  },
  async list(params?: { search?: string; limit?: number; offset?: number; includeRemoved?: boolean }): Promise<Paginated<Publisher>> {
    const { data } = await api.get<Paginated<Publisher>>('/publishers', { params });
    return data;
  },
  /**
   * Names-only roster (id + displayName) for resolving assignment names on
   * schedules. Open to every member; rows carry ONLY those two fields even
   * though they are typed as Publisher for drop-in use in name maps.
   */
  async roster(): Promise<{ data: Publisher[] }> {
    const { data } = await api.get<{ data: Publisher[] }>('/publishers/roster');
    return data;
  },
  async getById(id: string): Promise<Publisher> {
    const { data } = await api.get<Publisher>(`/publishers/${id}`);
    return data;
  },
  async create(input: CreatePublisherInput): Promise<Publisher> {
    const { data } = await api.post<Publisher>('/publishers', cleanPayload(input));
    return data;
  },
  async update(id: string, input: UpdatePublisherInput): Promise<Publisher> {
    const { data } = await api.patch<Publisher>(`/publishers/${id}`, cleanPayload(input));
    return data;
  },
  async remove(id: string, body: { reason: RemovalReason; date?: string; note?: string }): Promise<Publisher> {
    const { data } = await api.post<Publisher>(`/publishers/${id}/remove`, body);
    return data;
  },
  async restore(id: string): Promise<Publisher> {
    const { data } = await api.post<Publisher>(`/publishers/${id}/restore`);
    return data;
  },
  async purge(id: string): Promise<void> {
    await api.delete(`/publishers/${id}`);
  },
  async overrideStatus(
    id: string,
    status: PublisherStatus,
  ): Promise<Publisher> {
    const { data } = await api.patch<Publisher>(
      `/publishers/${id}/status`,
      { status },
    );
    return data;
  },
  async clearOverride(id: string): Promise<Publisher> {
    const { data } = await api.delete<Publisher>(
      `/publishers/${id}/status-override`,
    );
    return data;
  },
  async getAccess(id: string): Promise<AccessSummary> {
    const { data } = await api.get<AccessSummary>(`/publishers/${id}/access`);
    return data;
  },
  async grantAccess(
    id: string,
    input: GrantAccessInput,
  ): Promise<AccessSummary> {
    const { data } = await api.post<AccessSummary>(
      `/publishers/${id}/access`,
      input,
    );
    return data;
  },
  async updateAccess(
    id: string,
    input: UpdateAccessInput,
  ): Promise<AccessSummary> {
    const { data } = await api.patch<AccessSummary>(
      `/publishers/${id}/access`,
      input,
    );
    return data;
  },
  async resendInvite(id: string): Promise<AccessSummary> {
    const { data } = await api.post<AccessSummary>(
      `/publishers/${id}/access/resend-invite`,
    );
    return data;
  },
};


export interface GroupVisitRow {
  serviceGroupId: string;
  name: string;
  visitsThisYear: number;
  lastVisitDate: string | null;
  lastVisitBy: string | null;
  nextVisitDate: string | null;
}

/** Which groups the service overseer has visited, and which still wait. */
export const serviceOverseerApi = {
  async groupVisits(serviceYear?: number) {
    const { data } = await api.get<{
      serviceYear: number;
      groups: GroupVisitRow[];
    }>('/service-overseer/group-visits', {
      params: serviceYear ? { serviceYear } : undefined,
    });
    return data;
  },
};

export const serviceGroupsApi = {
  async list(params?: { search?: string; includeRemoved?: boolean }): Promise<Paginated<ServiceGroup>> {
    const { data } = await api.get<Paginated<ServiceGroup>>('/service-groups', { params });
    return data;
  },
  async getById(id: string): Promise<ServiceGroup> {
    const { data } = await api.get<ServiceGroup>(`/service-groups/${id}`);
    return data;
  },
  async getPublishers(id: string): Promise<Paginated<Publisher>> {
    const { data } = await api.get<Paginated<Publisher>>(`/service-groups/${id}/publishers`);
    return data;
  },
  async addPublishers(id: string, publisherIds: string[]): Promise<void> {
    await api.post(`/service-groups/${id}/publishers`, { publisherIds });
  },
  async removePublisher(id: string, publisherId: string): Promise<void> {
    await api.delete(`/service-groups/${id}/publishers/${publisherId}`);
  },
  async create(input: CreateServiceGroupInput): Promise<ServiceGroup> {
    const { data } = await api.post<ServiceGroup>('/service-groups', cleanPayload(input));
    return data;
  },
  async update(id: string, input: UpdateServiceGroupInput): Promise<ServiceGroup> {
    const { data } = await api.patch<ServiceGroup>(`/service-groups/${id}`, cleanPayload(input));
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/service-groups/${id}`);
  },
  async restore(id: string): Promise<ServiceGroup> {
    const { data } = await api.post<ServiceGroup>(`/service-groups/${id}/restore`);
    return data;
  },
};

// ---------- Special events ----------

export interface SpecialEvent {
  id: string;
  congregationId: string;
  title: string;
  type: string | null;
  date: string;
  endDate: string | null;
  time: string | null;
  timeEnd: string | null;
  address: string | null;
  mapUrl: string | null;
  programUrl: string | null;
  note: string | null;
  coFirstName: string | null;
  coLastName: string | null;
  coWifeName: string | null;
  coRole: string | null;
  coAccommodationAddress: string | null;
  coAccommodationPublisherId: string | null;
  coMidweekDow: number | null;
  replacesMeeting: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateSpecialEventInput {
  title: string;
  type?: string;
  date: string;
  endDate?: string;
  time?: string;
  timeEnd?: string;
  address?: string;
  mapUrl?: string;
  programUrl?: string;
  note?: string;
  coFirstName?: string;
  coLastName?: string;
  coWifeName?: string | null;
  coRole?: string | null;
  coAccommodationAddress?: string;
  coAccommodationPublisherId?: string | null;
  coMidweekDow?: number;
  replacesMeeting?: boolean;
}

export type UpdateSpecialEventInput = Partial<CreateSpecialEventInput>;

export type CircuitOverseerRole = 'overseer' | 'substitute';

export interface CircuitOverseer {
  id: string;
  congregationId: string;
  firstName: string;
  lastName: string;
  wifeName: string | null;
  role: CircuitOverseerRole;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCircuitOverseerInput {
  firstName: string;
  lastName: string;
  wifeName?: string | null;
  role?: CircuitOverseerRole;
  isPrimary?: boolean;
}

export type UpdateCircuitOverseerInput = Partial<CreateCircuitOverseerInput>;

function cleanEventPayload(
  input: CreateSpecialEventInput | UpdateSpecialEventInput,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined),
  );
}

export interface Absence {
  id: string;
  congregationId: string;
  publisherId: string;
  startDate: string;
  endDate: string | null;
  note: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  publisher?: {
    id: string;
    displayName: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface CreateAbsenceInput {
  publisherId: string;
  startDate: string;
  endDate?: string;
  note?: string;
}

export type UpdateAbsenceInput = Partial<CreateAbsenceInput>;

export type MyAssignmentKind =
  | 'meeting'
  | 'duty'
  | 'cleaning'
  | 'cart'
  | 'field_service'
  | 'outgoing_talk'
  | 'co_lunch';

export interface MyAssignmentItem {
  kind: MyAssignmentKind;
  sortDate: string;
  weekStartDate?: string;
  dayOfWeek?: number;
  date?: string;
  eventType?: string;
  time?: string;
  timeEnd?: string;
  endTime?: string;
  label: string;
  /** Duty slot number (microphones are numbered 1..n on screen). */
  slotIndex?: number;
  windows?: number[];
  thoroughPlannedAt?: string;
  location?: string;
  mapUrl?: string;
  congregationName?: string;
  asAssistant?: boolean;
  /** The other person in a pair, by name. */
  partnerName?: string;
  /** Field-service visit: he comes as the service overseer's assistant. */
  asOverseerAssistant?: boolean;
  /** Field-service visit: whose group is being visited. */
  groupName?: string;
  /** This field-service meeting IS the service overseer's visit. */
  serviceOverseerVisit?: boolean;
  /** Field-service visit: the other man of the pair, by name. */
  visitWithName?: string;
  note?: string;
  partKey?: string;
  partOrder?: number;
}

export interface MyAssignmentsResponse {
  publisherId: string | null;
  items: MyAssignmentItem[];
}

export interface MyPublisherLite {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  pioneerType: string | null;
  /** Own appointment — not private; the roster shows it to everyone anyway. */
  appointment: string | null;
  serviceGroupId: string | null;
  /** Own contacts — the publisher keeps these up to date themselves. */
  mobilePhone: string | null;
  email: string | null;
  address: string | null;
  /** Yearly check: when the contacts were last confirmed, and by whom. */
  contactsConfirmedAt: string | null;
  contactsConfirmedByUserId: string | null;
  contactsConfirmedByName: string | null;
}

export interface MyPublisherIdentityResponse {
  publisher: MyPublisherLite | null;
}

export interface BackupStatus {
  available: boolean;
  count: number;
  latest: { name: string; size: number; modifiedAt: string } | null;
}

export const backupsApi = {
  /** Admin only — status of the encrypted DB backups produced by the cron. */
  async status(): Promise<BackupStatus> {
    const { data } = await api.get<BackupStatus>('/admin/backups');
    return data;
  },
  /** Admin only — fetch one encrypted backup file as a Blob (web download). */
  async download(name: string): Promise<Blob> {
    const { data } = await api.get(
      `/admin/backups/${encodeURIComponent(name)}`,
      { responseType: 'blob' },
    );
    return data as Blob;
  },
};

/** Weeks where the signed-in publisher has something on (week drawer marks). */
export interface MyWeekMarks {
  weekStartDate: string;
  midweekParts: boolean;
  midweekDuties: boolean;
  weekendParts: boolean;
  weekendDuties: boolean;
  cleaning: boolean;
  fieldService: boolean;
}

/** What a person hears about; every category is on unless switched off. */
export interface NotificationPreferences {
  assignments: boolean;
  ministry: boolean;
  cleaning: boolean;
  reports: boolean;
  admin: boolean;
}

export type NotificationCategory = keyof NotificationPreferences;

export const meApi = {
  async notificationPreferences(): Promise<NotificationPreferences> {
    const { data } = await api.get<NotificationPreferences>(
      '/me/notification-preferences',
    );
    return data;
  },
  async setNotificationPreference(
    category: NotificationCategory,
    enabled: boolean,
  ): Promise<NotificationPreferences> {
    const { data } = await api.patch<NotificationPreferences>(
      '/me/notification-preferences',
      { category, enabled },
    );
    return data;
  },
  async weeks(): Promise<MyWeekMarks[]> {
    const { data } = await api.get<MyWeekMarks[]>('/me/weeks');
    return data;
  },
  async assignments(): Promise<MyAssignmentsResponse> {
    const { data } = await api.get<MyAssignmentsResponse>('/me/assignments');
    return data;
  },
  async updateContacts(input: {
    mobilePhone?: string | null;
    email?: string | null;
    address?: string | null;
  }): Promise<MyPublisherIdentityResponse> {
    const { data } = await api.patch<MyPublisherIdentityResponse>(
      '/me/publisher/contacts',
      input,
    );
    return data;
  },
  async confirmContacts(): Promise<MyPublisherIdentityResponse> {
    const { data } = await api.post<MyPublisherIdentityResponse>(
      '/me/publisher/contacts/confirm',
    );
    return data;
  },
  async publisher(): Promise<MyPublisherIdentityResponse> {
    const { data } =
      await api.get<MyPublisherIdentityResponse>('/me/publisher');
    return data;
  },
  /** GDPR Art. 15/20 — download the signed-in user's own data as JSON. */
  async exportData(): Promise<unknown> {
    const { data } = await api.get<unknown>('/me/export');
    return data;
  },
  /** GDPR Art. 17 — erase own account (anonymises the publisher record). */
  async eraseAccount(password: string): Promise<void> {
    await api.post('/me/erase', { password });
  },
};

export const absencesApi = {
  async list(params?: {
    publisherId?: string;
    all?: boolean;
    includeRemoved?: boolean;
  }): Promise<Absence[]> {
    const { data } = await api.get<Absence[]>('/absences', {
      params: {
        publisherId: params?.publisherId || undefined,
        all: params?.all ? 'true' : undefined,
        includeRemoved: params?.includeRemoved ? 'true' : undefined,
      },
    });
    return data;
  },
  async getById(id: string): Promise<Absence> {
    const { data } = await api.get<Absence>(`/absences/${id}`);
    return data;
  },
  async create(input: CreateAbsenceInput): Promise<Absence> {
    const { data } = await api.post<Absence>('/absences', cleanPayload(input));
    return data;
  },
  async update(id: string, input: UpdateAbsenceInput): Promise<Absence> {
    const { data } = await api.patch<Absence>(
      `/absences/${id}`,
      cleanPayload(input),
    );
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/absences/${id}`);
  },
  async restore(id: string): Promise<Absence> {
    const { data } = await api.post<Absence>(`/absences/${id}/restore`);
    return data;
  },
};

export interface LocalNeedsTopic {
  id: string;
  congregationId: string;
  title: string;
  notes: string | null;
  speakerPublisherId: string | null;
  usedWeek: string | null;
  /** The meeting part this topic became, when placed from the schedule. */
  usedAssignmentId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  speaker?: {
    id: string;
    displayName: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface CreateLocalNeedsTopicInput {
  title: string;
  notes?: string | null;
  speakerPublisherId?: string | null;
  usedWeek?: string | null;
}

export type UpdateLocalNeedsTopicInput = Partial<CreateLocalNeedsTopicInput>;

export const localNeedsApi = {
  async list(params?: {
    onlyPlanned?: boolean;
    includeRemoved?: boolean;
  }): Promise<LocalNeedsTopic[]> {
    const { data } = await api.get<LocalNeedsTopic[]>('/local-needs', {
      params: {
        onlyPlanned: params?.onlyPlanned ? 'true' : undefined,
        includeRemoved: params?.includeRemoved ? 'true' : undefined,
      },
    });
    return data;
  },
  async getById(id: string): Promise<LocalNeedsTopic> {
    const { data } = await api.get<LocalNeedsTopic>(`/local-needs/${id}`);
    return data;
  },
  async create(input: CreateLocalNeedsTopicInput): Promise<LocalNeedsTopic> {
    const { data } = await api.post<LocalNeedsTopic>(
      '/local-needs',
      cleanPayload(input),
    );
    return data;
  },
  async update(
    id: string,
    input: UpdateLocalNeedsTopicInput,
  ): Promise<LocalNeedsTopic> {
    const { data } = await api.patch<LocalNeedsTopic>(
      `/local-needs/${id}`,
      cleanPayload(input),
    );
    return data;
  },
  /**
   * Mark a topic as used. With no week the SERVER decides, from the
   * congregation's own clock — the screen used to compute it from the device,
   * which is a different week for a phone set to another timezone.
   */
  async markUsed(
    id: string,
    input?: { week?: string; assignmentId?: string },
  ): Promise<LocalNeedsTopic> {
    const { data } = await api.post<LocalNeedsTopic>(
      `/local-needs/${id}/used`,
      cleanPayload(input ?? {}),
    );
    return data;
  },
  /** Back to the plan: no week, and no part it belongs to. */
  async markPlanned(id: string): Promise<LocalNeedsTopic> {
    const { data } = await api.delete<LocalNeedsTopic>(
      `/local-needs/${id}/used`,
    );
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/local-needs/${id}`);
  },
  async restore(id: string): Promise<LocalNeedsTopic> {
    const { data } = await api.post<LocalNeedsTopic>(
      `/local-needs/${id}/restore`,
    );
    return data;
  },
};

// ---------- Pioneer Service School ----------

export interface PioneerSchool {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  hallName: string | null;
  hallAddress: string | null;
  startTime: string | null;
  endTime: string | null;
  microphoneSlots: number;
  notes: string | null;
}

export interface PioneerSchoolHelper {
  id: string;
  firstName: string;
  lastName: string;
  congregationName: string | null;
  publisherId: string | null;
}

export interface PioneerSchoolDuty {
  id: string;
  dutyType: 'av' | 'microphone' | 'ventilation' | 'custom';
  slotIndex: number;
  customLabel: string | null;
  helperId: string | null;
  helperName: string | null;
  helperCongregation: string | null;
  /** He is off the list of brothers, but still standing on this day. */
  helperRemoved: boolean;
  /** 'away' | 'busyAtMeeting' | 'twoMicrophones' — advice, never a refusal. */
  warnings: string[];
}

export interface PioneerSchoolDay {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  duties: PioneerSchoolDuty[];
}

export interface PioneerSchoolFull {
  school: PioneerSchool;
  days: PioneerSchoolDay[];
}

export const pioneerSchoolApi = {
  async list(): Promise<PioneerSchool[]> {
    const { data } = await api.get<PioneerSchool[]>('/pioneer-school');
    return data;
  },
  async get(id: string): Promise<PioneerSchoolFull> {
    const { data } = await api.get<PioneerSchoolFull>(`/pioneer-school/${id}`);
    return data;
  },
  async create(input: Partial<PioneerSchool>): Promise<PioneerSchool> {
    const { data } = await api.post<PioneerSchool>('/pioneer-school', input);
    return data;
  },
  async update(
    id: string,
    input: Partial<PioneerSchool>,
  ): Promise<PioneerSchool> {
    const { data } = await api.patch<PioneerSchool>(
      `/pioneer-school/${id}`,
      input,
    );
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/pioneer-school/${id}`);
  },
  async updateDay(
    id: string,
    dayId: string,
    input: { startTime?: string | null; endTime?: string | null },
  ): Promise<PioneerSchoolDay> {
    const { data } = await api.patch<PioneerSchoolDay>(
      `/pioneer-school/${id}/days/${dayId}`,
      input,
    );
    return data;
  },
  async assignDuty(
    id: string,
    dutyId: string,
    helperId: string | null,
  ): Promise<void> {
    await api.patch(`/pioneer-school/${id}/duties/${dutyId}`, { helperId });
  },
  async addCustomDuty(
    id: string,
    input: { dayId: string; customLabel: string },
  ): Promise<void> {
    await api.post(`/pioneer-school/${id}/duties`, input);
  },
  async removeCustomDuty(id: string, dutyId: string): Promise<void> {
    await api.delete(`/pioneer-school/${id}/duties/${dutyId}`);
  },
  async load(id: string): Promise<Record<string, number>> {
    const { data } = await api.get<Record<string, number>>(
      `/pioneer-school/${id}/load`,
    );
    return data;
  },
  async listHelpers(): Promise<PioneerSchoolHelper[]> {
    const { data } = await api.get<PioneerSchoolHelper[]>(
      '/pioneer-school/helpers',
    );
    return data;
  },
  async createHelper(
    input: Omit<PioneerSchoolHelper, 'id'>,
  ): Promise<PioneerSchoolHelper> {
    const { data } = await api.post<PioneerSchoolHelper>(
      '/pioneer-school/helpers',
      cleanPayload(input),
    );
    return data;
  },
  async updateHelper(
    id: string,
    input: Partial<PioneerSchoolHelper>,
  ): Promise<PioneerSchoolHelper> {
    const { data } = await api.patch<PioneerSchoolHelper>(
      `/pioneer-school/helpers/${id}`,
      input,
    );
    return data;
  },
  async removeHelper(id: string): Promise<void> {
    await api.delete(`/pioneer-school/helpers/${id}`);
  },
};

export const specialEventsApi = {
  async list(params?: {
    all?: boolean;
    includeRemoved?: boolean;
  }): Promise<SpecialEvent[]> {
    const { data } = await api.get<SpecialEvent[]>('/special-events', {
      params: {
        all: params?.all ? 'true' : undefined,
        includeRemoved: params?.includeRemoved ? 'true' : undefined,
      },
    });
    return data;
  },
  async getById(id: string): Promise<SpecialEvent> {
    const { data } = await api.get<SpecialEvent>(`/special-events/${id}`);
    return data;
  },
  async create(input: CreateSpecialEventInput): Promise<SpecialEvent> {
    const { data } = await api.post<SpecialEvent>(
      '/special-events',
      cleanEventPayload(input),
    );
    return data;
  },
  async update(
    id: string,
    input: UpdateSpecialEventInput,
  ): Promise<SpecialEvent> {
    const { data } = await api.patch<SpecialEvent>(
      `/special-events/${id}`,
      cleanEventPayload(input),
    );
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/special-events/${id}`);
  },
  async restore(id: string): Promise<SpecialEvent> {
    const { data } = await api.post<SpecialEvent>(
      `/special-events/${id}/restore`,
    );
    return data;
  },
};

export const circuitOverseersApi = {
  async list(): Promise<CircuitOverseer[]> {
    const { data } = await api.get<CircuitOverseer[]>('/circuit-overseers');
    return data;
  },
  async create(input: CreateCircuitOverseerInput): Promise<CircuitOverseer> {
    const { data } = await api.post<CircuitOverseer>('/circuit-overseers', {
      firstName: input.firstName,
      lastName: input.lastName,
      wifeName: input.wifeName ?? null,
      role: input.role ?? 'overseer',
      isPrimary: input.isPrimary ?? false,
    });
    return data;
  },
  async update(
    id: string,
    input: UpdateCircuitOverseerInput,
  ): Promise<CircuitOverseer> {
    const { data } = await api.patch<CircuitOverseer>(
      `/circuit-overseers/${id}`,
      input,
    );
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/circuit-overseers/${id}`);
  },
};

// Backward-compatible helper used by the visit form until it adopts the
// picker: returns the primary overseer (or the first), or null.
export const circuitOverseerApi = {
  async get(): Promise<CircuitOverseer | null> {
    const list = await circuitOverseersApi.list();
    return list.find((c) => c.isPrimary) ?? list[0] ?? null;
  },
};

export const assignmentsApi = {
  async publishedWeeks(): Promise<
    { weekStartDate: string; hasMidweek: boolean; hasWeekend: boolean }[]
  > {
    const { data } = await api.get<
      { weekStartDate: string; hasMidweek: boolean; hasWeekend: boolean }[]
    >('/assignments/weeks');
    return data;
  },
  async list(params?: {
    weekStart?: string;
    weekEnd?: string;
    eventType?: EventType;
    status?: AssignmentStatus;
    publisherId?: string;
    partKey?: string;
    includeRemoved?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Paginated<Assignment>> {
    const { data } = await api.get<Paginated<Assignment>>('/assignments', { params });
    return data;
  },
  async getById(id: string): Promise<Assignment> {
    const { data } = await api.get<Assignment>(`/assignments/${id}`);
    return data;
  },
  /**
   * Swap or move the weekend public-talk contents between two weeks (the
   * booked speaker arrived on a different date). 'swap' exchanges the weeks,
   * 'move' fills the target and clears the source. The "К нам" journal is
   * re-synced server-side for both weeks.
   */
  async swapPublicTalk(input: {
    sourceWeekStartDate: string;
    targetWeekStartDate: string;
    mode: 'swap' | 'move';
  }): Promise<{ source: Assignment; target: Assignment }> {
    const { data } = await api.post<{ source: Assignment; target: Assignment }>(
      '/assignments/public-talk/swap',
      { eventType: 'weekend', ...input },
    );
    return data;
  },
  async create(input: CreateAssignmentInput): Promise<Assignment> {
    const { data } = await api.post<Assignment>('/assignments', cleanPayload(input));
    return data;
  },
  async bulkCreate(inputs: CreateAssignmentInput[]): Promise<Assignment[]> {
    const { data } = await api.post<Assignment[]>('/assignments/bulk', {
      assignments: inputs.map(cleanPayload),
    });
    return data;
  },
  /** Flip every draft of one meeting (week + section) to published. */
  async publish(input: {
    weekStartDate: string;
    eventType: EventType;
    notify?: boolean;
  }): Promise<{ published: number }> {
    const { data } = await api.post<{ published: number }>(
      '/assignments/publish',
      input,
    );
    return data;
  },
  async notifyChanges(input: {
    weekStartDate: string;
    eventType: EventType;
  }): Promise<{ notified: number }> {
    const { data } = await api.post<{ notified: number }>(
      '/assignments/notify-changes',
      input,
    );
    return data;
  },
  async update(id: string, input: UpdateAssignmentInput): Promise<Assignment> {
    const payload = Object.fromEntries(
      // Keep '' so a cleared field reaches the server; only drop undefined
      // (undefined means "field not part of this patch / no change").
      Object.entries(input).filter(([_, v]) => v !== undefined),
    );
    const { data } = await api.patch<Assignment>(`/assignments/${id}`, payload);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/assignments/${id}`);
  },
  async restore(id: string): Promise<Assignment> {
    const { data } = await api.post<Assignment>(`/assignments/${id}/restore`);
    return data;
  },
};

export const scheduleImportApi = {
  /**
   * Применяет программу, разобранную НА КЛИЕНТЕ: файл публикации
   * не загружается — отправляются только готовые назначения.
   */
  async apply(payload: ApplyParsedPayload): Promise<ImportResult> {
    const { data } = await api.post<ImportResult>('/mwb-import/apply', payload);
    return data;
  },
};

export const publicTalksApi = {
  async list(params?: {
    search?: string;
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Paginated<PublicTalk>> {
    const { data } = await api.get<Paginated<PublicTalk>>('/public-talks', { params });
    return data;
  },
  async getById(id: string): Promise<PublicTalk> {
    const { data } = await api.get<PublicTalk>(`/public-talks/${id}`);
    return data;
  },
  async create(input: CreatePublicTalkInput): Promise<PublicTalk> {
    const { data } = await api.post<PublicTalk>('/public-talks', input);
    return data;
  },
  async update(id: string, input: UpdatePublicTalkInput): Promise<PublicTalk> {
    const { data } = await api.patch<PublicTalk>(`/public-talks/${id}`, cleanPayload(input));
    return data;
  },
  async deactivate(id: string): Promise<PublicTalk> {
    const { data } = await api.delete<PublicTalk>(`/public-talks/${id}`);
    return data;
  },
  async reactivate(id: string): Promise<PublicTalk> {
    const { data } = await api.post<PublicTalk>(`/public-talks/${id}/reactivate`);
    return data;
  },
  async bulkImport(text: string): Promise<BulkImportResult> {
    const { data } = await api.post<BulkImportResult>('/public-talks/bulk-import', { text });
    return data;
  },
};

export const songsApi = {
  async list(params?: {
    search?: string;
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Paginated<Song>> {
    const { data } = await api.get<Paginated<Song>>('/songs', { params });
    return data;
  },
  async create(input: CreateSongInput): Promise<Song> {
    const { data } = await api.post<Song>('/songs', input);
    return data;
  },
  async update(id: string, input: UpdateSongInput): Promise<Song> {
    const { data } = await api.patch<Song>(`/songs/${id}`, input);
    return data;
  },
  async bulkImport(text: string): Promise<BulkImportResult> {
    const { data } = await api.post<BulkImportResult>('/songs/bulk-import', { text });
    return data;
  },
};

/**
 * The signed-in publisher's own standing for the month they should be
 * reporting now (the previous calendar month). `applicable` is false for
 * anyone who does not submit reports; then the card shows nothing.
 */
export interface MyReportStanding {
  applicable: boolean;
  reportMonth: string | null;
  submitted: boolean;
  reportId: string | null;
}

export const serviceReportsApi = {
  async submit(input: SubmitServiceReportInput): Promise<ServiceReport> {
    const { data } = await api.post<ServiceReport>('/service-reports', cleanPayload(input));
    return data;
  },
  async listMy(): Promise<ServiceReport[]> {
    const { data } = await api.get<ServiceReport[]>('/service-reports/my');
    return data;
  },
  /** The caller's own report standing for the previous month. */
  async myStanding(): Promise<MyReportStanding> {
    const { data } = await api.get<MyReportStanding>(
      '/service-reports/my-standing',
    );
    return data;
  },
  async getById(id: string): Promise<ServiceReport> {
    const { data } = await api.get<ServiceReport>(`/service-reports/${id}`);
    return data;
  },
  async update(id: string, input: UpdateServiceReportInput): Promise<ServiceReport> {
    const { data } = await api.patch<ServiceReport>(`/service-reports/${id}`, cleanPayload(input));
    return data;
  },
  async findGroup(reportMonth: string): Promise<GroupReportsResponse> {
    const { data } = await api.get<GroupReportsResponse>('/service-reports/group', {
      params: { reportMonth },
    });
    return data;
  },
  async getAuditLog(reportId: string): Promise<AuditLogEntry[]> {
    const { data } = await api.get<AuditLogEntry[]>(
      `/service-reports/${reportId}/audit-log`,
    );
    return data;
  },
  async getHistoryForPublisher(
    publisherId: string,
    months: number = 12,
  ): Promise<PublisherHistoryResponse> {
    const { data } = await api.get<PublisherHistoryResponse>(
      `/service-reports/by-publisher/${publisherId}`,
      { params: { months } },
    );
    return data;
  },
  async getCollection(): Promise<ReportCollection> {
    const { data } = await api.get<ReportCollection>(
      '/service-reports/collection',
    );
    return data;
  },
  async getSummary(reportMonth: string): Promise<ServiceReportSummary> {
    const { data } = await api.get<ServiceReportSummary>(
      '/service-reports/summary',
      { params: { reportMonth } },
    );
    return data;
  },
  async getYearSummary(year?: number): Promise<ServiceYearSummary> {
    const { data } = await api.get<ServiceYearSummary>(
      '/service-reports/year-summary',
      { params: year ? { year } : {} },
    );
    return data;
  },
  async getS21Data(publisherId: string, year?: number): Promise<S21DataResponse> {
    const { data } = await api.get<S21DataResponse>(
      `/service-reports/s21/${publisherId}`,
      { params: year ? { year } : {} },
    );
    return data;
  },
  async getClosureStatus(reportMonth: string): Promise<ClosureStatus> {
    const { data } = await api.get<ClosureStatus>(
      '/service-reports/closure',
      { params: { reportMonth } },
    );
    return data;
  },
  async closeMonth(reportMonth: string): Promise<ClosureStatus> {
    const { data } = await api.post<ClosureStatus>('/service-reports/close', {
      reportMonth,
    });
    return data;
  },
  async reopenMonth(reportMonth: string): Promise<ClosureStatus> {
    const { data } = await api.post<ClosureStatus>('/service-reports/reopen', {
      reportMonth,
    });
    return data;
  },
};

export function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const msg = error.response?.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

// ---------- Auth failure callback ----------
// AuthProvider registers a callback so the interceptor can clear UI state
// and navigate to /login when both access AND refresh tokens are dead.
let onAuthFailure: (() => void) | null = null;

export function setOnAuthFailure(callback: (() => void) | null) {
  onAuthFailure = callback;
}

// ---------- Token helpers ----------
export async function storeAuthTokens(
  accessToken: string,
  refreshToken?: string,
): Promise<void> {
  await setAccessToken(accessToken);
  // In cookie mode there is no refresh token to keep — that is the point.
  if (!USE_COOKIE_AUTH && refreshToken) {
    await storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export async function clearAuthTokens(): Promise<void> {
  memoryAccessToken = null;
  // Also wipe anything an older build of this app left in localStorage, so a
  // token from before the cookie switch does not linger where scripts can
  // reach it.
  await storage.removeItem(TOKEN_KEY);
  await storage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * True when a session might be restorable without asking for a password: on
 * the web that means "the browser may still hold the refresh cookie", which we
 * cannot see from here, so the only way to find out is to try.
 */
export function mayHaveSession(): boolean {
  return USE_COOKIE_AUTH;
}

// ---------- Refresh-token response interceptor ----------
// Deduplicates concurrent refresh attempts: while one refresh is in flight,
// all other 401s wait for the same promise and retry with the new token.
let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  // On the web the token is not ours to send: the browser attaches the cookie.
  // On a device we still hand it over explicitly from secure storage.
  const refreshToken = USE_COOKIE_AUTH
    ? undefined
    : await storage.getItem(REFRESH_TOKEN_KEY);
  if (!USE_COOKIE_AUTH && !refreshToken) {
    throw new Error('No refresh token available');
  }
  // Raw axios call (not `api`) to bypass our own interceptors and avoid recursion
  const { data } = await axios.post<{
    accessToken: string;
    refreshToken?: string;
  }>(
    `${API_URL}/auth/refresh`,
    refreshToken ? { refreshToken } : {},
    {
      timeout: 10_000,
      withCredentials: USE_COOKIE_AUTH,
      // X-Client belongs here above all. This call bypasses our interceptors
      // on purpose (it would recurse through them), and it is ALSO the only
      // moment a signed-in phone tells the server anything about itself: the
      // session's client details are written on sign-in and on refresh, and
      // nothing else. Without the header here, a phone that stays signed in
      // never reports what it is — which is exactly why «Управление
      // пользователями» kept showing «Неизвестно» for every phone.
      headers: {
        'X-Client': CLIENT_DESCRIPTION,
        ...(USE_COOKIE_AUTH ? { [AUTH_MODE_HEADER]: 'cookie' } : {}),
      },
    },
  );
  await setAccessToken(data.accessToken);
  // The server rotates the refresh token on every use: the one we just sent is
  // now spent, and sending it again is read as a stolen token and signs the
  // account out everywhere. Storing the replacement is not optional.
  // The rotated token comes back in the body only on a device; in cookie mode
  // the server has already replaced the cookie and sends nothing here.
  //
  // The guard is on the mode, not on whether a token happens to be present. If
  // something between us and the server ever dropped the X-Auth-Mode header,
  // the reply would carry the token again and a plain presence check would
  // quietly write it back into localStorage — undoing the whole change without
  // a single visible symptom.
  if (!USE_COOKIE_AUTH) {
    if (data.refreshToken) {
      await storage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    }
  } else if (data.refreshToken) {
    console.warn(
      '[auth] server returned a refresh token in cookie mode — the X-Auth-Mode header is not reaching it',
    );
  }
  return data.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const original = error.config as any;

    const is401 = error.response?.status === 401;
    const isAuthEndpoint =
      original?.url?.includes('/auth/refresh') ||
      original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/bootstrap');

    if (is401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = performRefresh().finally(() => {
            refreshPromise = null;
          });
        }
        const newAccessToken = await refreshPromise;

        if (original.headers) {
          original.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return api.request(original);
      } catch {
        // Refresh itself failed — both tokens are dead. Clear and notify UI.
        await clearAuthTokens();
        onAuthFailure?.();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);


// =============================================================
// Push notifications (Phase G)
// =============================================================

export interface PushDeviceInfo {
  platform: string;
  osVersion?: string | null;
}

export const pushApi = {
  register: async (token: string, deviceInfo: PushDeviceInfo): Promise<void> => {
    await api.post('/push-tokens', { token, deviceInfo });
  },
  unregister: async (token: string): Promise<void> => {
    await api.delete('/push-tokens', { data: { token } });
  },
};


// =============================================================
// Activity feed (Phase H)
// =============================================================

export type ActivityFeedEntryType =
  | 'status_change'
  | 'report_submitted'
  | 'report_updated'
  | 'override_applied'
  | 'override_cleared'
  | 'other';

export interface ActivityFeedEntry {
  id: string;
  type: ActivityFeedEntryType;
  occurredAt: string;
  actorName: string | null;
  targetType: 'publisher' | 'service_report' | 'other';
  targetId: string;
  summary: string;
  publisherName?: string;
  reportMonth?: string;
  oldStatus?: string;
  newStatus?: string;
}

export interface ActivityFeedResponse {
  items: ActivityFeedEntry[];
  nextCursor: string | null;
}

export const activityApi = {
  list: async (opts: {
    limit?: number;
    before?: string;
  }): Promise<ActivityFeedResponse> => {
    const params: Record<string, any> = {};
    if (opts.limit != null) params.limit = opts.limit;
    if (opts.before != null) params.before = opts.before;
    const { data } = await api.get<ActivityFeedResponse>('/activity-feed', {
      params,
    });
    return data;
  },
};

// ---- Auxiliary pioneers (Служение → Подсобное пионерское служение) ----

export interface AuxPioneerMonthRow {
  id: string;
  publisherId: string;
  publisherName: string;
  startMonth: string;
  endMonth: string | null;
  untilCancelled: boolean;
  hourGoal: number;
}

export interface AuxPioneerJournalRow {
  id: string;
  publisherId: string;
  publisherName: string;
  startMonth: string;
  endMonth: string | null;
  untilCancelled: boolean;
  state: 'upcoming' | 'serving' | 'finished';
  currentPioneerType: PioneerType;
}

/** One own enrolment period. */
export interface MyAuxPioneerPeriod {
  startMonth: string;
  endMonth: string | null;
  untilCancelled: boolean;
}

/**
 * The signed-in publisher's own standing around a month: the period covering
 * it, and the next one that has not started yet.
 */
export interface MyAuxPioneerStatus {
  serving: boolean;
  current: MyAuxPioneerPeriod | null;
  upcoming: MyAuxPioneerPeriod | null;
}

export const auxiliaryPioneersApi = {
  async listForMonth(monthIso: string): Promise<{
    month: string;
    hourGoal: number;
    rows: AuxPioneerMonthRow[];
  }> {
    const { data } = await api.get('/auxiliary-pioneers', {
      params: { month: monthIso },
    });
    return data;
  },
  async journal(): Promise<AuxPioneerJournalRow[]> {
    const { data } = await api.get<AuxPioneerJournalRow[]>(
      '/auxiliary-pioneers/journal',
    );
    return data;
  },
  /**
   * The caller's OWN standing in a month — never the roster: whether they
   * serve in it, the period covering it, and the next one not yet started.
   */
  async mine(monthIso: string): Promise<MyAuxPioneerStatus> {
    const { data } = await api.get<MyAuxPioneerStatus>(
      '/auxiliary-pioneers/mine',
      { params: { month: monthIso } },
    );
    return data;
  },
  async create(input: {
    publisherId: string;
    startMonth: string;
    endMonth?: string;
    untilCancelled?: boolean;
    note?: string;
  }): Promise<void> {
    await api.post('/auxiliary-pioneers', input);
  },
  async stop(id: string, endMonth?: string): Promise<void> {
    await api.patch(`/auxiliary-pioneers/${id}/stop`, { endMonth });
  },
  async update(
    id: string,
    input: {
      startMonth?: string;
      endMonth?: string;
      untilCancelled?: boolean;
    },
  ): Promise<void> {
    await api.patch(`/auxiliary-pioneers/${id}`, input);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/auxiliary-pioneers/${id}`);
  },
};

// ---------------------------------------------------------------- Журнал

export interface JournalPerson {
  id: string;
  name: string | null;
}

export interface JournalEntry {
  id: string;
  occurredAt: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'DOWNLOAD' | 'DENY';
  source: 'user' | 'system';
  entityType: string;
  entityId: string;
  actor: JournalPerson | null;
  subject: JournalPerson | null;
  changedFields: string[];
  /** Values as they were before the change; null for events with no history. */
  before: Record<string, unknown> | null;
  /**
   * Whether «вернуть как было» would work on this entry.
   *
   * Decided by the server, which owns the list of what can come back — the app
   * used to show the button on every edit and let the sheet break the news.
   */
  canRevert?: boolean;
  /**
   * Which item the entry is about — the meeting, the date, the part. Null when
   * it cannot be resolved (usually because the item has since been deleted).
   */
  context: {
    date?: string;
    eventType?: string;
    kind?: string;
    title?: string;
  } | null;
  detail: Record<string, unknown> | null;
  /** Values cleared at the subject's request; the entry itself remains. */
  redacted: boolean;
}

export interface JournalPage {
  items: JournalEntry[];
  nextCursor: string | null;
  /** Ids mentioned anywhere on the page, mapped to readable names. */
  names: Record<string, string>;
}

export interface JournalFilters {
  limit?: number;
  before?: string;
  entityType?: string;
  action?: string;
  personId?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
}

export interface RevertPlan {
  supported: boolean;
  /** notAnEdit | redacted | entityNotSupported | nothingRevertable */
  reason?: string;
  fields: { field: string; from: unknown; to: unknown }[];
  /** How many times the record was edited AFTER this entry. */
  changedAfter: number;
}

export interface AppVersionInfo {
  /** The newest build handed out, or null when nothing is announced. */
  current: string | null;
  /** The oldest build still able to talk to this server. */
  minimum: string | null;
  downloadUrl: string;
}

export const appVersionApi = {
  async get(): Promise<AppVersionInfo> {
    const { data } = await api.get<AppVersionInfo>('/app-version');
    return data;
  },
};

export const journalApi = {
  async list(filters: JournalFilters = {}): Promise<JournalPage> {
    const { data } = await api.get<JournalPage>('/journal', {
      params: filters,
    });
    return data;
  },
  /** What a revert would change — asked before it is done. */
  async revertPlan(id: string): Promise<RevertPlan> {
    const { data } = await api.get<RevertPlan>(`/journal/${id}/revert`);
    return data;
  },
  async revert(id: string): Promise<void> {
    await api.post(`/journal/${id}/revert`);
  },
};


// ------------------------------------------------- Посещаемость встреч (S-3)

export interface AttendanceRow {
  date: string;
  eventType: 'midweek' | 'weekend';
  count: number | null;
  notHeld: boolean;
  /** False when the meeting happened but no figure has been entered yet. */
  recorded: boolean;
  /** Who entered the figure and when it was last written. */
  recordedByName?: string | null;
  recordedAt?: string | null;
  /** True when the figure was changed after it was first entered. */
  corrected?: boolean;
}

export interface AttendanceMonth {
  month: string;
  midweek: AttendanceRow[];
  weekend: AttendanceRow[];
  midweekTotal: number;
  midweekAverage: number | null;
  weekendTotal: number;
  weekendAverage: number | null;
}

export interface AttendanceYear {
  startYear: number;
  months: AttendanceMonth[];
}

/** A meeting already held with no figure yet. */
export interface PendingMeeting {
  date: string;
  eventType: 'midweek' | 'weekend';
}

export interface PendingAttendance {
  meetings: PendingMeeting[];
  /** Everything still unrecorded in the current service year. */
  outstandingThisYear: number;
}

export const attendanceApi = {
  async pending(): Promise<PendingAttendance> {
    const { data } = await api.get<PendingAttendance>(
      '/meeting-attendance/pending',
    );
    return data;
  },
  async serviceYear(startYear?: number): Promise<AttendanceYear> {
    const { data } = await api.get<AttendanceYear>(
      '/meeting-attendance/service-year',
      { params: startYear ? { startYear } : undefined },
    );
    return data;
  },
  async record(input: {
    date: string;
    eventType: 'midweek' | 'weekend';
    count?: number;
    notHeld?: boolean;
    note?: string;
  }): Promise<void> {
    await api.post('/meeting-attendance', input);
  },
};


// ------------------------------------------- Годовой отчёт собрания (S-10)

export interface CountedPublisher {
  id: string;
  name: string;
  /** The month that put them in this group, where one applies. */
  month?: string;
}

export interface MonthlyReporters {
  month: string;
  count: number;
}

export interface AnnualFigures {
  startYear: number;
  /** Reports received per month — the shape of the year, not a judgement. */
  monthlyReporters: MonthlyReporters[];
  active: CountedPublisher[];
  becameInactive: CountedPublisher[];
  reactivated: CountedPublisher[];
  deaf: CountedPublisher[];
  blind: CountedPublisher[];
  imprisoned: CountedPublisher[];
}

export const annualReportApi = {
  async figures(startYear?: number): Promise<AnnualFigures> {
    const { data } = await api.get<AnnualFigures>('/annual-report', {
      params: startYear ? { startYear } : undefined,
    });
    return data;
  },
};

// ---- Задачи совета старейшин ------------------------------------------

export type TaskArea =
  | 'ministry'
  | 'teaching'
  | 'care'
  | 'organisation'
  | 'accounts'
  | 'other';

export interface ElderTask {
  id: string;
  title: string;
  details: string | null;
  area: TaskArea;
  assigneePublisherId: string | null;
  dueDate: string | null;
  status: 'open' | 'done';
  doneAt: string | null;
  eldersMeetingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTaskInput {
  title?: string;
  details?: string | null;
  area?: TaskArea;
  assigneePublisherId?: string | null;
  dueDate?: string | null;
  eldersMeetingId?: string | null;
  status?: 'open' | 'done';
}


export interface EldersMeeting {
  id: string;
  date: string;
  startTime: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgendaResult {
  meeting: EldersMeeting | null;
  onAgenda: ElderTask[];
  overdue: ElderTask[];
  dueSoon: ElderTask[];
}

/** Elders and admins only — the server refuses everyone else. */
export const tasksApi = {
  async list(status?: 'open' | 'done') {
    const { data } = await api.get<ElderTask[]>('/tasks', {
      params: status ? { status } : undefined,
    });
    return data;
  },
  async create(input: UpsertTaskInput) {
    const { data } = await api.post<ElderTask>('/tasks', input);
    return data;
  },
  async update(id: string, input: UpsertTaskInput) {
    const { data } = await api.patch<ElderTask>(`/tasks/${id}`, input);
    return data;
  },
  async remove(id: string) {
    await api.delete(`/tasks/${id}`);
  },

  async meetings() {
    const { data } = await api.get<EldersMeeting[]>('/tasks/meetings');
    return data;
  },
  async createMeeting(input: {
    date: string;
    startTime?: string | null;
    note?: string | null;
  }) {
    const { data } = await api.post<EldersMeeting>('/tasks/meetings', input);
    return data;
  },
  async updateMeeting(
    id: string,
    input: { date?: string; startTime?: string | null; note?: string | null },
  ) {
    const { data } = await api.patch<EldersMeeting>(
      `/tasks/meetings/${id}`,
      input,
    );
    return data;
  },
  async removeMeeting(id: string) {
    await api.delete(`/tasks/meetings/${id}`);
  },

  async agenda(meetingId?: string) {
    const { data } = await api.get<AgendaResult>('/tasks/agenda', {
      params: meetingId ? { meetingId } : undefined,
    });
    return data;
  },
};
