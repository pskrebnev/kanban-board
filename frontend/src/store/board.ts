import { create } from "zustand";

import { api } from "../api";
import { useTicketsStore, type Ticket, type TicketState, type TicketType } from "./tickets";

export type BoardStatus = "idle" | "loading" | "ready" | "error";

export type BoardFilters = {
  type: TicketType | "";
  epicId: string;
  search: string;
};

const EMPTY_FILTERS: BoardFilters = { type: "", epicId: "", search: "" };

type BoardState = {
  selectedTeamId: string | null;
  tickets: Ticket[];
  status: BoardStatus;
  filters: BoardFilters;
  moveError: string;
  selectTeam: (teamId: string | null) => Promise<void>;
  fetchBoard: () => Promise<void>;
  setFilter: (patch: Partial<BoardFilters>) => void;
  clearFilters: () => void;
  moveTicket: (ticketId: string, toState: TicketState) => Promise<void>;
  dismissMoveError: () => void;
};

// The board is read-driven by the existing Phase 5 ticket list endpoint and
// persists drags through the Phase 5 state endpoint (reused via the tickets
// store). The server stays the system of record: an optimistic move is rolled
// back if the API rejects it.
export const useBoardStore = create<BoardState>((set, get) => ({
  selectedTeamId: null,
  tickets: [],
  status: "idle",
  filters: EMPTY_FILTERS,
  moveError: "",

  selectTeam: async (teamId) => {
    // Switching teams clears filters so a stale epic filter can't hide the new
    // team's tickets (its epics differ).
    set({ selectedTeamId: teamId, filters: EMPTY_FILTERS, moveError: "" });
    await get().fetchBoard();
  },

  fetchBoard: async () => {
    const teamId = get().selectedTeamId;
    if (!teamId) {
      set({ tickets: [], status: "idle" });
      return;
    }

    set({ status: "loading" });
    try {
      const response = await api.get<{ tickets: Ticket[] }>("/tickets", { params: { teamId } });
      set({ tickets: response.data.tickets, status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },

  setFilter: (patch) => set({ filters: { ...get().filters, ...patch } }),

  clearFilters: () => set({ filters: EMPTY_FILTERS }),

  moveTicket: async (ticketId, toState) => {
    const snapshot = get().tickets;
    const ticket = snapshot.find((t) => t.id === ticketId);
    if (!ticket || ticket.state === toState) {
      return;
    }

    // Optimistically move the card and float it to the top of its new column
    // (columns are ordered most-recently-modified first).
    const optimistic = snapshot.map((t) =>
      t.id === ticketId ? { ...t, state: toState, modifiedAt: new Date().toISOString() } : t,
    );
    set({ tickets: optimistic, moveError: "" });

    try {
      const updated = await useTicketsStore.getState().changeState(ticketId, toState);
      // Reconcile with the authoritative server row (real modified_at).
      set({ tickets: get().tickets.map((t) => (t.id === ticketId ? updated : t)) });
    } catch {
      // Roll the card back to its previous column and surface the error (spec §8).
      set({
        tickets: snapshot,
        moveError: "Could not move the ticket; it was returned to its previous column.",
      });
    }
  },

  dismissMoveError: () => set({ moveError: "" }),
}));
