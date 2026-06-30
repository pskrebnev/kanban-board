import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";

import { useAuthStore } from "../store/auth";

export function ProtectedRoute({ children }: { children: ReactElement }): ReactElement {
  const status = useAuthStore((state) => state.status);

  if (status === "idle" || status === "loading") {
    return (
      <main className="centered">
        <p>Loading…</p>
      </main>
    );
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }

  return children;
}
