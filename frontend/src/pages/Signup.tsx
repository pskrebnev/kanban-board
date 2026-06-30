import { useState, type FormEvent, type ReactElement } from "react";
import { Link } from "react-router-dom";

import { api, apiErrorMessage } from "../api";

export function Signup(): ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");

    try {
      const response = await api.post<{ message: string }>("/auth/signup", { email, password });
      setMessage(response.data.message);
      setStatus("success");
    } catch (error) {
      setMessage(apiErrorMessage(error, "Could not create your account."));
      setStatus("error");
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Kanban Ticketing</p>
        <h1>Create your account</h1>

        {status === "success" ? (
          <div>
            <p className="success">{message}</p>
            <p>
              Once verified, you can <Link to="/login">log in</Link>.
            </p>
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
            <label>
              Password
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
              {status === "loading" ? "Creating…" : "Sign up"}
            </button>
          </form>
        )}

        <p className="auth-alt">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </section>
    </main>
  );
}
