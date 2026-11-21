import { useAuth } from '../store/auth';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
  get offline() {
    return this.status === 0;
  }
}

/** Fetch wrapper: adds the JWT, parses JSON, turns failures into ApiError with a friendly message. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = useAuth.getState().token;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('No internet connection', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) useAuth.getState().logout();
  if (!res.ok) throw new ApiError(data.error ?? 'Request failed', res.status, data.details);
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
