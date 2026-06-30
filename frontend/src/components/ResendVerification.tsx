import { useState, type FormEvent, type ReactElement } from "react";

import { api, apiErrorMessage } from "../api";

export function ResendVerification({ initialEmail = "" }: { initialEmail?: string }): ReactElement {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");

    try {
      const response = await api.post<{ message: string }>("/auth/resend", { email });
      setMessage(response.data.message);
      setStatus("sent");
    } catch (error) {
      setMessage(apiErrorMessage(error, "Could not resend the verification email."));
      setStatus("error");
    }
  }

  return (
    <form className="resend" onSubmit={handleSubmit}>
      <p className="muted">Need a new verification link?</p>
      <div className="field-row">
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <button type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Sending…" : "Resend"}
        </button>
      </div>
      {status === "sent" && <p className="success">{message}</p>}
      {status === "error" && <p className="error">{message}</p>}
    </form>
  );
}
