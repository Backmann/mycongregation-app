import axios, { AxiosError } from 'axios';
import { storage } from './storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export const TOKEN_KEY = 'congmap.token';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
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

export interface Paginated<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// ---------- Helpers ----------

/** Strips empty strings and undefined; null is kept (server treats null as "clear field"). */
function cleanPayload<T extends Record<string, any>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([_, v]) => v !== '' && v !== undefined),
  ) as Partial<T>;
}

// ---------- Endpoints ----------

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/auth/login', {
      email,
      password,
    });
    return data;
  },
  async me(): Promise<AuthUser> {
    const { data } = await api.get<AuthUser>('/auth/me');
    return data;
  },
};

export const publishersApi = {
  async list(params?: {
    search?: string;
    limit?: number;
    offset?: number;
    includeRemoved?: boolean;
  }): Promise<Paginated<Publisher>> {
    const { data } = await api.get<Paginated<Publisher>>('/publishers', {
      params,
    });
    return data;
  },
  async getById(id: string): Promise<Publisher> {
    const { data } = await api.get<Publisher>(`/publishers/${id}`);
    return data;
  },
  async create(input: CreatePublisherInput): Promise<Publisher> {
    const { data } = await api.post<Publisher>(
      '/publishers',
      cleanPayload(input),
    );
    return data;
  },
  async update(id: string, input: UpdatePublisherInput): Promise<Publisher> {
    const { data } = await api.patch<Publisher>(
      `/publishers/${id}`,
      cleanPayload(input),
    );
    return data;
  },
  async remove(
    id: string,
    body: { reason: RemovalReason; note?: string },
  ): Promise<Publisher> {
    const { data } = await api.post<Publisher>(
      `/publishers/${id}/remove`,
      body,
    );
    return data;
  },
  async restore(id: string): Promise<Publisher> {
    const { data } = await api.post<Publisher>(`/publishers/${id}/restore`);
    return data;
  },
};

export const familiesApi = {
  async list(params?: {
    search?: string;
    includeRemoved?: boolean;
  }): Promise<Paginated<Family>> {
    const { data } = await api.get<Paginated<Family>>('/families', { params });
    return data;
  },
  async getById(id: string): Promise<Family> {
    const { data } = await api.get<Family>(`/families/${id}`);
    return data;
  },
  async getPublishers(id: string): Promise<Paginated<Publisher>> {
    const { data } = await api.get<Paginated<Publisher>>(
      `/families/${id}/publishers`,
    );
    return data;
  },
  async create(input: CreateFamilyInput): Promise<Family> {
    const { data } = await api.post<Family>('/families', cleanPayload(input));
    return data;
  },
  async update(id: string, input: UpdateFamilyInput): Promise<Family> {
    const { data } = await api.patch<Family>(
      `/families/${id}`,
      cleanPayload(input),
    );
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
  async list(params?: {
    search?: string;
    includeRemoved?: boolean;
  }): Promise<Paginated<ServiceGroup>> {
    const { data } = await api.get<Paginated<ServiceGroup>>('/service-groups', {
      params,
    });
    return data;
  },
  async getById(id: string): Promise<ServiceGroup> {
    const { data } = await api.get<ServiceGroup>(`/service-groups/${id}`);
    return data;
  },
  async getPublishers(id: string): Promise<Paginated<Publisher>> {
    const { data } = await api.get<Paginated<Publisher>>(
      `/service-groups/${id}/publishers`,
    );
    return data;
  },
  async create(input: CreateServiceGroupInput): Promise<ServiceGroup> {
    const { data } = await api.post<ServiceGroup>(
      '/service-groups',
      cleanPayload(input),
    );
    return data;
  },
  async update(
    id: string,
    input: UpdateServiceGroupInput,
  ): Promise<ServiceGroup> {
    const { data } = await api.patch<ServiceGroup>(
      `/service-groups/${id}`,
      cleanPayload(input),
    );
    return data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/service-groups/${id}`);
  },
  async restore(id: string): Promise<ServiceGroup> {
    const { data } = await api.post<ServiceGroup>(
      `/service-groups/${id}/restore`,
    );
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
