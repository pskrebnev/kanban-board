import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { Board } from "./pages/Board";
import { Epics } from "./pages/Epics";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Login } from "./pages/Login";
import { ResetPassword } from "./pages/ResetPassword";
import { Signup } from "./pages/Signup";
import { Teams } from "./pages/Teams";
import { TicketCreate } from "./pages/TicketCreate";
import { TicketDetail } from "./pages/TicketDetail";
import { Tickets } from "./pages/Tickets";
import { VerifyEmail } from "./pages/VerifyEmail";
import { useAuthStore } from "./store/auth";
import "./styles.css";

function App() {
  const fetchMe = useAuthStore((state) => state.fetchMe);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Board />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teams"
          element={
            <ProtectedRoute>
              <Teams />
            </ProtectedRoute>
          }
        />
        <Route
          path="/epics"
          element={
            <ProtectedRoute>
              <Epics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickets"
          element={
            <ProtectedRoute>
              <Tickets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickets/new"
          element={
            <ProtectedRoute>
              <TicketCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <ProtectedRoute>
              <TicketDetail />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
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
