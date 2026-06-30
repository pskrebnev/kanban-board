import { useState, type FormEvent, type ReactElement } from "react";
import { Link } from "react-router-dom";

import { api, apiErrorMessage } from "../api";

export function ForgotPassword(): ReactElement {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");

    try {
      const response = await api.post<{ message: string }>("/auth/forgot-password", { email });
      setMessage(response.data.message);
      setStatus("sent");
    } catch (error) {
      setMessage(apiErrorMessage(error, "Could not start password recovery."));
      setStatus("error");
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Kanban Ticketing</p>
        <h1>Reset your password</h1>

        {status === "sent" ? (
          <div>
            <p className="success">{message}</p>
            <p className="muted">Open the link from the email to choose a new password.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <p className="muted">We will email you a link to set a new password.</p>

            {status === "error" && <p className="error">{message}</p>}

            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="auth-alt">
          Remembered it? <Link to="/login">Back to log in</Link>
        </p>
      </section>
    </main>
  );
}
