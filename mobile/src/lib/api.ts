export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface User {
  id: string;
  email: string;
  name: string;
  currency: string;
  monthlyEmail: boolean;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}

export interface SyncRecord {
  id: string;
  updatedAt: number;
  deleted: boolean;
  [field: string]: unknown;
}

export interface Changes {
  transactions?: SyncRecord[];
  savings?: SyncRecord[];
  budgets?: SyncRecord[];
  investments?: SyncRecord[];
  categories?: SyncRecord[];
}

export interface SyncResponse {
  serverTime: number;
  changes: Required<Changes>;
  rejected?: Array<{ resource: string; id: string; reason: string }>;
}

const request = async <T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'offline');
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, payload?.error ?? `request_failed_${response.status}`);
  }
  return payload as T;
};

export const api = {
  register: (body: { email: string; password: string; name: string; deviceName: string; platform: string }) =>
    request<Session>('/api/auth/register', { method: 'POST', body }),

  login: (body: { email: string; password: string; deviceName: string; platform: string }) =>
    request<Session>('/api/auth/login', { method: 'POST', body }),

  refresh: (deviceId: string, refreshToken: string) =>
    request<{ accessToken: string; refreshToken: string; deviceId: string }>('/api/auth/refresh', {
      method: 'POST',
      body: { deviceId, refreshToken },
    }),

  me: (token: string) =>
    request<{ user: User; devices: Array<{ id: string; name: string; platform: string; lastSeenAt: number; current: boolean }> }>(
      '/api/auth/me',
      { token },
    ),

  updateMe: (token: string, body: { name?: string; monthlyEmail?: boolean }) =>
    request<{ user: User }>('/api/auth/me', { method: 'PATCH', token, body }),

  pull: (token: string, since: number) => request<SyncResponse>(`/api/sync?since=${since}`, { token }),

  push: (token: string, since: number, changes: Changes) =>
    request<SyncResponse>('/api/sync', { method: 'POST', token, body: { since, changes } }),

  emailReport: (token: string, month: string) =>
    request<{ sent: boolean; month: string; to: string }>('/api/reports/email', {
      method: 'POST',
      token,
      body: { month },
    }),
};

export const isOffline = (error: unknown): boolean => error instanceof ApiError && error.status === 0;

export const isAuthError = (error: unknown): boolean => error instanceof ApiError && error.status === 401;
