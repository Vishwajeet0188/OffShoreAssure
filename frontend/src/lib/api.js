/* Small client for the OffshoreAssure API (Express + PostgreSQL, see /server).
   In development Vite proxies /api to http://localhost:4000, so the session cookie stays same-site.
   In production set VITE_API_URL to the API's address (e.g. https://api.example.com/api). */
const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || 'Something went wrong. Please try again.');
    this.status = status; this.code = body?.error; this.body = body || {}; this.fields = body?.fields || {};
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method, credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, { error: 'network', message: 'Cannot reach the OffshoreAssure server. Check that the API is running.' });
  }
  const data = await res.json().catch(() => null);
  // No JSON from a 5xx usually means the dev proxy could not reach the API (server not running).
  if (!res.ok && !data && res.status >= 500) throw new ApiError(res.status, { error: 'network', message: 'Cannot reach the OffshoreAssure server. Make sure the API is running (cd server, npm run dev).' });
  if (!res.ok) throw new ApiError(res.status, data || {});
  return data || {};
}
