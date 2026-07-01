import { create } from "zustand";

import { api } from "../api";

export const TICKET_TYPES = ["bug", "feature", "fix"] as const;
export const TICKET_STATES = [
  "new",
  "ready_for_implementation",
  "in_progress",
  "ready_for_acceptance",
  "done",
] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketState = (typeof TICKET_STATES)[number];

export const TYPE_LABELS: Record<TicketType, string> = {
  bug: "Bug",
  feature: "Feature",
  fix: "Fix",
};

export const STATE_LABELS: Record<TicketState, string> = {
  new: "New",
  ready_for_implementation: "Ready for implementation",
  in_progress: "In progress",
  ready_for_acceptance: "Ready for acceptance",
  done: "Done",
};

// Colour-coding (Phase 9). These are the single source of truth for how a
// ticket's type and workflow state are coloured; the class strings are literal
// so Tailwind detects and generates the utilities. Colour always accompanies the
// text label (STATE_LABELS/TYPE_LABELS) — it is a reinforcement, not the sole cue.

// Soft pill for a ticket type (background + text), used on cards and lists.
export const TYPE_STYLES: Record<TicketType, string> = {
  bug: "bg-type-bug-soft text-type-bug",
  feature: "bg-type-feature-soft text-type-feature",
  fix: "bg-type-fix-soft text-type-fix",
};

// Soft pill for a workflow state (background + text).
export const STATE_STYLES: Record<TicketState, string> = {
  new: "bg-state-new-soft text-state-new",
  ready_for_implementation: "bg-state-ready-soft text-state-ready",
  in_progress: "bg-state-progress-soft text-state-progress",
  ready_for_acceptance: "bg-state-acceptance-soft text-state-acceptance",
  done: "bg-state-done-soft text-state-done",
};

// Top-border accent for a board column, in the state's strong colour.
export const STATE_COLUMN_ACCENT: Record<TicketState, string> = {
  new: "border-t-state-new",
  ready_for_implementation: "border-t-state-ready",
  in_progress: "border-t-state-progress",
  ready_for_acceptance: "border-t-state-acceptance",
  done: "border-t-state-done",
};

export type Ticket = {
  id: string;
  teamId: string;
  teamName: string;
  epicId: string | null;
  epicTitle: string | null;
  type: TicketType;
  state: TicketState;
  title: string;
  body: string;
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
  modifiedAt: string;
};

export type TicketsStatus = "idle" | "loading" | "ready" | "error";

export type TicketFilters = {
  teamId?: string;
  state?: TicketState;
  type?: TicketType;
  epicId?: string;
};

export type CreateTicketInput = {
  teamId: string;
  type: TicketType;
  title: string;
  body: string;
  epicId: string | null;
};

export type UpdateTicketInput = {
  title?: string;
  body?: string;
  type?: TicketType;
  state?: TicketState;
  teamId?: string;
  epicId?: string | null;
};

type TicketsState = {
  tickets: Ticket[];
  status: TicketsStatus;
  filters: TicketFilters;
  setFilters: (filters: TicketFilters) => Promise<void>;
  fetchTickets: () => Promise<void>;
  getTicket: (id: string) => Promise<Ticket>;
  createTicket: (input: CreateTicketInput) => Promise<Ticket>;
  updateTicket: (id: string, input: UpdateTicketInput) => Promise<Ticket>;
  changeState: (id: string, state: TicketState) => Promise<Ticket>;
  deleteTicket: (id: string) => Promise<void>;
};

// The server is the system of record; the list refetches after mutations so
// ordering (most-recently-modified first) and derived names stay correct.
export const useTicketsStore = create<TicketsState>((set, get) => ({
  tickets: [],
  status: "idle",
  filters: {},

  setFilters: async (filters) => {
    set({ filters });
    await get().fetchTickets();
  },

  fetchTickets: async () => {
    set({ status: "loading" });

    try {
      const { filters } = get();
      const params: Record<string, string> = {};
      if (filters.teamId) params.teamId = filters.teamId;
      if (filters.state) params.state = filters.state;
      if (filters.type) params.type = filters.type;
      if (filters.epicId) params.epicId = filters.epicId;

      const response = await api.get<{ tickets: Ticket[] }>("/tickets", { params });
      set({ tickets: response.data.tickets, status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },

  getTicket: async (id) => {
    const response = await api.get<{ ticket: Ticket }>(`/tickets/${id}`);
    return response.data.ticket;
  },

  createTicket: async (input) => {
    const response = await api.post<{ ticket: Ticket }>("/tickets", input);
    return response.data.ticket;
  },

  updateTicket: async (id, input) => {
    const response = await api.patch<{ ticket: Ticket }>(`/tickets/${id}`, input);
    return response.data.ticket;
  },

  changeState: async (id, state) => {
    const response = await api.patch<{ ticket: Ticket }>(`/tickets/${id}/state`, { state });
    return response.data.ticket;
  },

  deleteTicket: async (id) => {
    await api.delete(`/tickets/${id}`);
  },
}));
