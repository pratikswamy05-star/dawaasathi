import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lang, User } from '../types';

interface AuthState {
  token: string | null;
  user: User | null;
  /** Language used before login and as the default. */
  lang: Lang;
  login: (token: string, user: User) => void;
  setUser: (user: User) => void;
  setLang: (lang: Lang) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      lang: 'en',
      login: (token, user) => set({ token, user, lang: user.language }),
      setUser: (user) => set({ user, lang: user.language }),
      setLang: (lang) => set((s) => ({ lang, user: s.user ? { ...s.user, language: lang } : null })),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'dawaasathi-auth' },
  ),
);
