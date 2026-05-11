import axios, { AxiosError } from 'axios';
import { storage } from './storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export const TOKEN_KEY = 'mycongregation.token';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 60_000,
});

api.interceptors.request.use(async (config) => {
  const token = await storage.getItem(TOKEN_KEY);
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
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export type Gender = 'brother' | 'sister';
export type PublisherAppointment =
  | 'elder'
  | 'ministerial_servant'
  | 'publisher'
  | 'unbaptized_publisher'
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
  familyId: string | null;
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
  isFamilyHead: boolean;
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
  familyId?: string | null;
  serviceGroupId?: string | null;
  userId?: string;
  isActive?: boolean;
  isRegular?: boolean;
  isFamilyHead?: boolean;
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

export interface Family {
  id: string;
  congregationId: string;
  name: string;
  headPublisherId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface CreateFamilyInput {
  name: string;
  headPublisherId?: string | null;
  notes?: string;
}
export type UpdateFamilyInput = Partial<CreateFamilyInput>;

export interface ServiceGroup {
  id: string;
  congregationId: string;
  name: string;
  overseerPublisherId: string | null;
  assistantPublisherId: string | null;
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

export interface BulkImportResult {
  parsed: number;
  created: number;
  updated: number;
  unchanged: number;
  invalid: number;
  examples: Array<{ number: number; title: string }>;
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
};

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
  async remove(id: string, body: { reason: RemovalReason; note?: string }): Promise<Publisher> {
    const { data } = await api.post<Publisher>(`/publishers/${id}/remove`, body);
    return data;
  },
  async restore(id: string): Promise<Publisher> {
    const { data } = await api.post<Publisher>(`/publishers/${id}/restore`);
    return data;
  },
};

export const familiesApi = {
  async list(params?: { search?: string; includeRemoved?: boolean }): Promise<Paginated<Family>> {
    const { data } = await api.get<Paginated<Family>>('/families', { params });
    return data;
  },
  async getById(id: string): Promise<Family> {
    const { data } = await api.get<Family>(`/families/${id}`);
    return data;
  },
  async getPublishers(id: string): Promise<Paginated<Publisher>> {
    const { data } = await api.get<Paginated<Publisher>>(`/families/${id}/publishers`);
    return data;
  },
  async create(input: CreateFamilyInput): Promise<Family> {
    const { data } = await api.post<Family>('/families', cleanPayload(input));
    return data;
  },
  async update(id: string, input: UpdateFamilyInput): Promise<Family> {
    const { data } = await api.patch<Family>(`/families/${id}`, cleanPayload(input));
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/families/${id}`);
  },
  async restore(id: string): Promise<Family> {
    const { data } = await api.post<Family>(`/families/${id}/restore`);
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
  async upload(file: { uri: string; name: string; mimeType?: string; file?: Blob }): Promise<ImportResult> {
    const formData = new FormData();
    if (file.file) {
      formData.append('file', file.file, file.name);
    } else {
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? 'application/epub+zip',
      } as any);
    }
    const { data } = await api.post<ImportResult>('/schedule-import/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    });
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
