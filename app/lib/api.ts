import axios, { AxiosError } from 'axios';
import { storage } from './storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export const TOKEN_KEY = 'congmap.token';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
});

// Inject Bearer on every request
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

export interface Publisher {
  id: string;
  congregationId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  displayName: string;
  gender: 'brother' | 'sister';
  appointment:
    | 'elder'
    | 'ministerial_servant'
    | 'publisher'
    | 'unbaptized_publisher'
    | 'none';
  pioneerType:
    | 'none'
    | 'auxiliary_until_cancelled'
    | 'regular'
    | 'special'
    | 'missionary';
  isActive: boolean;
  isAnointed: boolean;
  baptismDate: string | null;
  mobilePhone: string | null;
  email: string | null;
  removalReason: string | null;
  deletedAt: string | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
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
  }): Promise<Paginated<Publisher>> {
    const { data } = await api.get<Paginated<Publisher>>('/publishers', {
      params,
    });
    return data;
  },
};

// Helper to read user-friendly error from axios
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
