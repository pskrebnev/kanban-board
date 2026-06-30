import { create } from "zustand";

import { api } from "../api";

export type Team = {
  id: string;
  name: string;
  referenced: boolean;
};

export type TeamsStatus = "idle" | "loading" | "ready" | "error";

type TeamsState = {
  teams: Team[];
  status: TeamsStatus;
  error: string;
  fetchTeams: () => Promise<void>;
  createTeam: (name: string) => Promise<void>;
  renameTeam: (id: string, name: string) => Promise<void>;
  deleteTeam: (id: string) => Promise<void>;
};

// The server is the system of record; mutations refetch the list so the
// `referenced` flags and ordering always reflect the database.
export const useTeamsStore = create<TeamsState>((set, get) => ({
  teams: [],
  status: "idle",
  error: "",

  fetchTeams: async () => {
    set({ status: "loading", error: "" });

    try {
      const response = await api.get<{ teams: Team[] }>("/teams");
      set({ teams: response.data.teams, status: "ready" });
    } catch {
      set({ status: "error", error: "Could not load teams." });
    }
  },

  createTeam: async (name) => {
    await api.post("/teams", { name });
    await get().fetchTeams();
  },

  renameTeam: async (id, name) => {
    await api.patch(`/teams/${id}`, { name });
    await get().fetchTeams();
  },

  deleteTeam: async (id) => {
    await api.delete(`/teams/${id}`);
    await get().fetchTeams();
  },
}));
