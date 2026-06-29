import { DndContext } from "@dnd-kit/core";
import axios from "axios";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { create } from "zustand";
import "./styles.css";

type Column = {
  id: string;
  title: string;
  tickets: string[];
};

type HealthResponse = {
  status: string;
};

type BoardState = {
  columns: Column[];
  apiStatus: string;
  checkApi: () => Promise<void>;
};

const api = axios.create({
  baseURL: "/api",
});

const useBoardStore = create<BoardState>((set) => ({
  columns: [
    { id: "todo", title: "To Do", tickets: ["Draft architecture"] },
    { id: "in-progress", title: "In Progress", tickets: ["Wire Podman runtime"] },
    { id: "done", title: "Done", tickets: ["Create project scaffold"] },
  ],
  apiStatus: "Not checked",
  checkApi: async () => {
    const response = await api.get<HealthResponse>("/health");
    set({ apiStatus: response.data.status });
  },
}));

function Board() {
  const { columns, apiStatus, checkApi } = useBoardStore();

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Kanban Ticketing</p>
        <h1>React SPA backed by a Podman-hosted API and PostgreSQL.</h1>
        <button type="button" onClick={checkApi}>
          Check API
        </button>
        <span className="status">API status: {apiStatus}</span>
      </section>

      <DndContext>
        <section className="board" aria-label="Kanban board">
          {columns.map((column) => (
            <article className="column" key={column.id}>
              <h2>{column.title}</h2>
              {column.tickets.map((ticket) => (
                <div className="ticket" key={ticket}>
                  {ticket}
                </div>
              ))}
            </article>
          ))}
        </section>
      </DndContext>
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<Board />} />
      </Routes>
    </BrowserRouter>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
