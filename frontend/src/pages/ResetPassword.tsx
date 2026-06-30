import { useState, type SyntheticEvent, type ReactElement } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, apiErrorMessage } from "../api";

export function ResetPassword(): ReactElement {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();

    if (!token) {
      setMessage("This reset link is missing its token.");
      setStatus("error");
      return;
    }

    setStatus("loading");

    try {
      const response = await api.post<{ message: string }>("/auth/reset-password", {
        token,
        password,
      });
      setMessage(response.data.message);
      setStatus("success");
    } catch (error) {
      setMessage(apiErrorMessage(error, "Could not reset your password."));
      setStatus("error");
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Kanban Ticketing</p>
        <h1>Choose a new password</h1>

        {status === "success" ? (
          <div>
            <p className="success">{message}</p>
            <p>
              You can now <Link to="/login">log in</Link>.
            </p>
          </div>
        ) : !token ? (
          <div>
            <p className="error">This reset link is missing its token.</p>
            <p className="auth-alt">
              Request a new one on the <Link to="/forgot-password">password reset</Link> page.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
            <p className="muted">Use at least 8 characters.</p>

            {status === "error" && <p className="error">{message}</p>}

            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
