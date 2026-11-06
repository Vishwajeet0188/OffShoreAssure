/*
 * Small client for the OffshoreAssure API (Express + PostgreSQL, see /server).
 *
 * In development Vite forwards /api to http://localhost:4000, so the session
 * cookie stays on the same site. In production set VITE_API_URL to the API's
 * address, or forward /api to it from the web host.
 */
export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

// What users see when the service cannot be reached. Technical details go to the
// browser console in development only, never on the page.
export const UNAVAILABLE_MESSAGE =
  'We could not connect to OffshoreAssure just now. Please try again in a moment.';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || 'Something went wrong. Please try again.');
    this.status = status;
    this.code = body?.error;
    this.body = body || {};
    this.fields = body?.fields || {};
  }
}

export function unavailableError(status = 0, detail = '') {
  if (import.meta.env.DEV) {
    console.warn(
      `[OffshoreAssure] API not reachable (${detail || 'status ' + status}). Is the server running? cd server && npm run dev`,
    );
  }
  return new ApiError(status, { error: 'unavailable', message: UNAVAILABLE_MESSAGE });
}

export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw unavailableError(0, error.message);
  }
  return readResponse(response);
}

/* Shared by api() and the file uploads. */
export async function readResponse(response) {
  const data = await response.json().catch(() => null);

  // A 5xx without a JSON body means a proxy or host answered, not our API.
  if (!response.ok && !data && response.status >= 500) throw unavailableError(response.status);
  if (!response.ok) throw new ApiError(response.status, data || {});
  // A page instead of JSON (for example the site's index.html) also means the API is not there.
  if (!data) throw unavailableError(response.status, 'response was not JSON');
  return data;
}
