import { describe, expect, it } from "vitest";

import { signSession, verifySession } from "../src/auth/jwt.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { generateVerificationToken, hashToken } from "../src/auth/tokens.js";

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong password")).toBe(false);
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });
});

describe("verification tokens", () => {
  it("generates unique tokens and stable hashes", () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();

    expect(a).not.toBe(b);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});

describe("session JWT", () => {
  const secret = "unit-test-secret";

  it("signs and verifies session claims", () => {
    const token = signSession({ sub: "user-123", email: "a@b.com" }, secret);
    const claims = verifySession(token, secret);

    expect(claims).toEqual({ sub: "user-123", email: "a@b.com" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSession({ sub: "user-123", email: "a@b.com" }, secret);

    expect(verifySession(token, "other-secret")).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifySession("not.a.jwt", secret)).toBeNull();
  });
});
