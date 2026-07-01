import { useState, type SyntheticEvent, type ReactElement } from "react";

import { api, apiErrorMessage } from "../api";

export function ResendVerification({ initialEmail = "" }: { initialEmail?: string }): ReactElement {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: SyntheticEvent) {
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
    <form className="mt-6 border-t border-line pt-5" onSubmit={handleSubmit}>
      <p className="text-[0.85rem] text-muted">Need a new verification link?</p>
      <div className="mt-2 flex gap-2">
        <input
          type="email"
          placeholder="you@example.com"
          className="flex-1 rounded-lg border border-field px-3 py-2.5 font-[inherit]"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <button type="submit" className="whitespace-nowrap" disabled={status === "loading"}>
          {status === "loading" ? "Sending…" : "Resend"}
        </button>
      </div>
      {status === "sent" && <p className="mt-3 font-bold text-success">{message}</p>}
      {status === "error" && <p className="mt-3 font-bold text-danger">{message}</p>}
    </form>
  );
}
