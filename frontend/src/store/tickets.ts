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
