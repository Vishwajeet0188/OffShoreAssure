/* Signed-in user (Stage 0). The session lives in an httpOnly cookie set by the API;
   this context only mirrors /api/me for the UI. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, profile: null, profileComplete: false, vendor: null, membership: null });

  const apply = useCallback(data => setState({ loading: false, user: data?.user || null, profile: data?.profile || null, profileComplete: !!data?.profileComplete, vendor: data?.vendor || null, membership: data?.membership || null }), []);

  const refresh = useCallback(async () => {
    try { apply(await api('/me')); } catch { apply(null); }
  }, [apply]);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo(() => ({
    ...state,
    refresh,
    /* Each call returns the API response; errors are thrown as ApiError for the form to show. */
    register: (email, password, role = 'buyer') => api('/auth/register', { method: 'POST', body: { email, password, role } }),
    verify: async (email, code) => { const r = await api('/auth/verify', { method: 'POST', body: { email, code } }); if (r.user) apply(r); return r; },
    resendCode: (email, purpose = 'register') => api('/auth/resend-code', { method: 'POST', body: { email, purpose } }),
    login: async (email, password) => { const r = await api('/auth/login', { method: 'POST', body: { email, password } }); apply(r); return r; },
    logout: async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { apply(null); } },
    forgotPassword: email => api('/auth/forgot-password', { method: 'POST', body: { email } }),
    resetPassword: (email, code, newPassword) => api('/auth/reset-password', { method: 'POST', body: { email, code, newPassword } }),
    saveProfile: async profile => { const r = await api('/me/profile', { method: 'PUT', body: profile }); apply(r); return r; }
  }), [state, refresh, apply]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export const displayName = (user, profile) => (profile && profile.fullName) || (user ? user.email.split('@')[0] : '');
