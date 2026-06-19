import axios, { AxiosError } from 'axios';
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
});

api.interceptors.request.use(async (config) => {
  let token = await storage.getItem(TOKEN_KEY);

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
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
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
  createdAt: string;
  updatedAt: string;
  appointment: PublisherAppointment | null;
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
export type PioneerType =
  | 'none'
  | 'auxiliary_until_cancelled'
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
  isRegular: boolean;
  isElderlyOrInfirm: boolean;
  isChild: boolean;
  isDeaf: boolean;
  isBlind: boolean;
  isPrisoner: boolean;
  appointment: PublisherAppointment;
  baptismDate: string | null;
  ministryStartDate: string | null;
  pioneerType: PioneerType;
  pioneerSince: string | null;
  isAnointed: boolean;
  hasKingdomHallKey: boolean;
  printedWatchtower: boolean;
  printedWorkbook: boolean;
  sendsReportDirectly: boolean;
  spiritualNotes: string | null;
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
  isRegular?: boolean;
  isElderlyOrInfirm?: boolean;
  isChild?: boolean;
  isDeaf?: boolean;
  isBlind?: boolean;
  isPrisoner?: boolean;
  appointment?: PublisherAppointment;
  baptismDate?: string;
  ministryStartDate?: string;
  pioneerType?: PioneerType;
  pioneerSince?: string;
  isAnointed?: boolean;
  hasKingdomHallKey?: boolean;
  printedWatchtower?: boolean;
  printedWorkbook?: boolean;
  sendsReportDirectly?: boolean;
  spiritualNotes?: string;
  notes?: string;
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
  publicTalkId: string | null;
  speakerName: string | null;
  speakerCongregation: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
    status: PublisherStatus;
    statusManuallyOverridden: boolean;
    isPioneer: boolean;
  };
  timeline: PublisherHistoryEntry[];
}

export interface GroupReportsResponse {
  reportMonth: string;
  scopeLabel: string;
  closed: boolean;
  publishers: GroupReportRow[];
}

export interface GroupReportRow {
  publisherId: string;
  displayName: string;
  isPioneer: boolean;
  report: ServiceReport | null;
  canManage: boolean;
}

export interface ServiceReportSummaryCategory {
  pioneerType: PioneerType;
  count: number;
  hours: number | null;
  bibleStudies: number;
}

export interface ServiceReportSummary {
  reportMonth: string;
  categories: ServiceReportSummaryCategory[];
  totalActivePublishers: number;
  totalInactivePublishers: number;
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
  async resetPassword(token: string, password: string): Promise<void> {
    await api.post('/auth/reset-password', { token, password });
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
  | 'accounts_servant'
  | 'public_witnessing'
  | 'cleaning_coordinator'
  | 'duties_coordinator';

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
  congregation: { id: string; name: string; timezone: string | null };
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
  | 'audio'
  | 'video'
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

export type CleaningSlotType = 'after_meeting' | 'thorough' | 'general';

export interface CleaningAssignment {
  id: string;
  congregationId: string;
  weekStartDate: string;
  slotType: CleaningSlotType;
  serviceGroupId: string | null;
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
  }): Promise<CleaningAssignment> {
    const { data } = await api.put<CleaningAssignment>('/cleaning', input);
    return data;
  },
  async clearSlot(
    weekStartDate: string,
    slotType: CleaningSlotType,
  ): Promise<void> {
    await api.delete('/cleaning', { params: { weekStartDate, slotType } });
  },
};

export interface CartShiftParticipant {
  id: string;
  cartShiftId: string;
  publisherId: string;
  createdAt: string;
}

export interface CartShift {
  id: string;
  congregationId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  location: string;
  participants: CartShiftParticipant[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCartShiftInput {
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}

export type UpdateCartShiftInput = Partial<CreateCartShiftInput>;

export const cartShiftsApi = {
  async list(
    params: { from?: string; to?: string } = {},
  ): Promise<CartShift[]> {
    const { data } = await api.get<CartShift[]>('/cart-shifts', { params });
    return data;
  },
  async create(input: CreateCartShiftInput): Promise<CartShift> {
    const { data } = await api.post<CartShift>('/cart-shifts', input);
    return data;
  },
  async update(id: string, input: UpdateCartShiftInput): Promise<CartShift> {
    const { data } = await api.patch<CartShift>(`/cart-shifts/${id}`, input);
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/cart-shifts/${id}`);
  },
  async addParticipant(id: string, publisherId: string): Promise<CartShift> {
    const { data } = await api.post<CartShift>(
      `/cart-shifts/${id}/participants`,
      { publisherId },
    );
    return data;
  },
  async removeParticipant(
    id: string,
    publisherId: string,
  ): Promise<CartShift> {
    const { data } = await api.delete<CartShift>(
      `/cart-shifts/${id}/participants/${publisherId}`,
    );
    return data;
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
  async list(params?: { search?: string; limit?: number; offset?: number; includeRemoved?: boolean }): Promise<Paginated<Publisher>> {
    const { data } = await api.get<Paginated<Publisher>>('/publishers', { params });
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
  address: string | null;
  mapUrl: string | null;
  programUrl: string | null;
  note: string | null;
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
  address?: string;
  mapUrl?: string;
  programUrl?: string;
  note?: string;
  replacesMeeting?: boolean;
}

export type UpdateSpecialEventInput = Partial<CreateSpecialEventInput>;

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
  | 'field_service';

export interface MyAssignmentItem {
  kind: MyAssignmentKind;
  sortDate: string;
  weekStartDate?: string;
  dayOfWeek?: number;
  date?: string;
  eventType?: string;
  time?: string;
  endTime?: string;
  label: string;
  location?: string;
  asAssistant?: boolean;
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
}

export interface MyPublisherIdentityResponse {
  publisher: MyPublisherLite | null;
}

export const meApi = {
  async assignments(): Promise<MyAssignmentsResponse> {
    const { data } = await api.get<MyAssignmentsResponse>('/me/assignments');
    return data;
  },
  async publisher(): Promise<MyPublisherIdentityResponse> {
    const { data } =
      await api.get<MyPublisherIdentityResponse>('/me/publisher');
    return data;
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
  sortOrder: number;
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
  sortOrder?: number;
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

export const assignmentsApi = {
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
  async update(id: string, input: UpdateAssignmentInput): Promise<Assignment> {
    const payload = Object.fromEntries(
      Object.entries(input).filter(([_, v]) => v !== '' && v !== undefined),
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

export const serviceReportsApi = {
  async submit(input: SubmitServiceReportInput): Promise<ServiceReport> {
    const { data } = await api.post<ServiceReport>('/service-reports', cleanPayload(input));
    return data;
  },
  async listMy(): Promise<ServiceReport[]> {
    const { data } = await api.get<ServiceReport[]>('/service-reports/my');
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
  async getSummary(reportMonth: string): Promise<ServiceReportSummary> {
    const { data } = await api.get<ServiceReportSummary>(
      '/service-reports/summary',
      { params: { reportMonth } },
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
  refreshToken: string,
): Promise<void> {
  await storage.setItem(TOKEN_KEY, accessToken);
  await storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearAuthTokens(): Promise<void> {
  await storage.removeItem(TOKEN_KEY);
  await storage.removeItem(REFRESH_TOKEN_KEY);
}

// ---------- Refresh-token response interceptor ----------
// Deduplicates concurrent refresh attempts: while one refresh is in flight,
// all other 401s wait for the same promise and retry with the new token.
let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const refreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }
  // Raw axios call (not `api`) to bypass our own interceptors and avoid recursion
  const { data } = await axios.post<{ accessToken: string }>(
    `${API_URL}/auth/refresh`,
    { refreshToken },
    { timeout: 10_000 },
  );
  await storage.setItem(TOKEN_KEY, data.accessToken);
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
