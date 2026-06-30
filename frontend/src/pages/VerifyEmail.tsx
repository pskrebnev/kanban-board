import { useEffect, useState, type ReactElement } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, apiErrorMessage } from "../api";
import { ResendVerification } from "../components/ResendVerification";

export function VerifyEmail(): ReactElement {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!token) {
        setMessage("This verification link is missing its token.");
        setStatus("error");
        return;
      }

      try {
        const response = await api.get<{ message: string }>("/auth/verify", {
          params: { token },
        });
        if (!cancelled) {
          setMessage(response.data.message);
          setStatus("success");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(apiErrorMessage(error, "We could not verify your email."));
          setStatus("error");
        }
      }
    }

    void verify();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Kanban Ticketing</p>
        <h1>Email verification</h1>

        {status === "loading" && <p>Verifying your email…</p>}

        {status === "success" && (
          <div>
            <p className="success">{message}</p>
            <p>
              You can now <Link to="/login">log in</Link>.
            </p>
          </div>
        )}

        {status === "error" && (
          <div>
            <p className="error">{message}</p>
            <ResendVerification />
            <p className="auth-alt">
              Back to <Link to="/login">log in</Link>
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
