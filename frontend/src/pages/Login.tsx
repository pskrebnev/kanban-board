import { useState, type SyntheticEvent, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiErrorMessage } from "../api";
import { authAlt, authCard, authForm, authInput, authLabel, authShell, authTitle } from "../authUi";
import { ResendVerification } from "../components/ResendVerification";
import { useAuthStore } from "../store/auth";

export function Login(): ReactElement {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [showResend, setShowResend] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setStatus("loading");
    setShowResend(false);

    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (error) {
      const text = apiErrorMessage(error, "Could not log in.");
      setMessage(text);
      setStatus("error");
      if (text.toLowerCase().includes("verify")) {
        setShowResend(true);
      }
    }
  }

  return (
    <main className={authShell}>
      <section className={authCard}>
        <p className="eyebrow">Kanban Ticketing</p>
        <h1 className={authTitle}>Log in</h1>

        <form className={authForm} onSubmit={handleSubmit}>
          <label className={authLabel}>
            Email
            <input
              type="email"
              className={authInput}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className={authLabel}>
            Password
            <input
              type="password"
              className={authInput}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {status === "error" && <p className="error">{message}</p>}

          <button type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Logging in…" : "Log in"}
          </button>
        </form>

        {showResend && <ResendVerification initialEmail={email} />}

        <p className={authAlt}>
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
        <p className={authAlt}>
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
