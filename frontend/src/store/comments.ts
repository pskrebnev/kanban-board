import { create } from "zustand";

import { api } from "../api";

export type Comment = {
  id: string;
  ticketId: string;
  authorId: string;
  authorEmail: string;
  body: string;
  createdAt: string;
};

export type CommentsStatus = "idle" | "loading" | "ready" | "error";

type CommentsState = {
  comments: Comment[];
  status: CommentsStatus;
  fetchComments: (ticketId: string) => Promise<void>;
  postComment: (ticketId: string, body: string) => Promise<void>;
  reset: () => void;
};

// The server is the system of record; the list is refetched after a successful
// add so ordering (oldest-first) and the server-set author/timestamp are
// authoritative — no local-only comments. `postComment` only performs the POST;
// the caller decides when to refetch, so it can clear the input before the list
// re-renders (avoiding a clobbered just-typed value).
export const useCommentsStore = create<CommentsState>((set) => ({
  comments: [],
  status: "idle",

  fetchComments: async (ticketId) => {
    set({ status: "loading" });
    try {
      const response = await api.get<{ comments: Comment[] }>(`/tickets/${ticketId}/comments`);
      set({ comments: response.data.comments, status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },

  postComment: async (ticketId, body) => {
    await api.post(`/tickets/${ticketId}/comments`, { body });
  },

  reset: () => set({ comments: [], status: "idle" }),
}));
