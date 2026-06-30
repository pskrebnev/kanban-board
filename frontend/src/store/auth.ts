import { create } from "zustand";

import { api } from "../api";

export type User = {
  id: string;
  email: string;
  emailVerified: boolean;
};

export type AuthStatus = "idle" | "loading" | "authenticated" | "anonymous";

type AuthState = {
  user: User | null;
  status: AuthStatus;
  fetchMe: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",

  fetchMe: async () => {
    set({ status: "loading" });

    try {
      const response = await api.get<{ user: User }>("/auth/me");
      set({ user: response.data.user, status: "authenticated" });
    } catch {
      set({ user: null, status: "anonymous" });
    }
  },

  login: async (email, password) => {
    const response = await api.post<{ user: User }>("/auth/login", { email, password });
    set({ user: response.data.user, status: "authenticated" });
  },

  logout: async () => {
    await api.post("/auth/logout");
    set({ user: null, status: "anonymous" });
  },
}));
