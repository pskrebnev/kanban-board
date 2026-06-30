import { createHash, randomBytes } from "node:crypto";

/** Generates a high-entropy, URL-safe verification token. */
export function generateVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hashes a verification token for storage; the raw token is never persisted. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
