import { create } from "zustand";

import { api } from "../api";

export type Epic = {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  description: string | null;
  referenced: boolean;
};

export type EpicsStatus = "idle" | "loading" | "ready" | "error";

export type EpicInput = {
  title: string;
  description: string | null;
};

type EpicsState = {
  epics: Epic[];
  status: EpicsStatus;
  filterTeamId: string | null;
  setFilterTeam: (teamId: string | null) => Promise<void>;
  fetchEpics: () => Promise<void>;
  createEpic: (teamId: string, input: EpicInput) => Promise<void>;
  updateEpic: (id: string, input: EpicInput) => Promise<void>;
  deleteEpic: (id: string) => Promise<void>;
};

// The server is the system of record; mutations refetch the list so the
// `referenced` flags, team names, and ordering always reflect the database.
export const useEpicsStore = create<EpicsState>((set, get) => ({
  epics: [],
  status: "idle",
  filterTeamId: null,

  setFilterTeam: async (teamId) => {
    set({ filterTeamId: teamId });
    await get().fetchEpics();
  },

  fetchEpics: async () => {
    set({ status: "loading" });

    try {
      const teamId = get().filterTeamId;
      const response = await api.get<{ epics: Epic[] }>("/epics", {
        params: teamId ? { teamId } : undefined,
      });
      set({ epics: response.data.epics, status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },

  createEpic: async (teamId, input) => {
    await api.post("/epics", { teamId, title: input.title, description: input.description });
    await get().fetchEpics();
  },

  updateEpic: async (id, input) => {
    await api.patch(`/epics/${id}`, { title: input.title, description: input.description });
    await get().fetchEpics();
  },

  deleteEpic: async (id) => {
    await api.delete(`/epics/${id}`);
    await get().fetchEpics();
  },
}));
