import type pg from "pg";

import { hashPassword, verifyPassword } from "../auth/password.js";
import { generateVerificationToken, hashToken } from "../auth/tokens.js";
import type { SafeUser } from "../auth/types.js";
import type { Mailer } from "../email/mailer.js";
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from "../errors.js";
import {
  createUser,
  findUserByEmail,
  findUserById,
  markUserVerified,
  type UserRow,
} from "../repositories/user-repository.js";
import {
  consumeVerificationToken,
  createVerificationToken,
  findVerificationTokenByHash,
  invalidateUserTokens,
} from "../repositories/verification-token-repository.js";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export type AuthServiceDeps = {
  pool: pg.Pool;
  mailer: Mailer;
  appBaseUrl: string;
};

export type AuthService = {
  signup(email: string, password: string): Promise<void>;
  verify(token: string): Promise<void>;
  resend(email: string): Promise<void>;
  login(email: string, password: string): Promise<SafeUser>;
  getUserById(id: string): Promise<SafeUser | null>;
};

function toSafeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { pool, mailer, appBaseUrl } = deps;

  async function issueVerification(user: UserRow): Promise<void> {
    await invalidateUserTokens(pool, user.id);

    const token = generateVerificationToken();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
    await createVerificationToken(pool, user.id, hashToken(token), expiresAt);

    const verifyUrl = `${appBaseUrl}/verify?token=${encodeURIComponent(token)}`;
    await mailer.sendVerificationEmail(user.email, verifyUrl);
  }

  return {
    async signup(email, password) {
      const normalizedEmail = normalizeEmail(email);

      if (password.length < 8) {
        throw new ValidationError("Password must be at least 8 characters long");
      }

      const existing = await findUserByEmail(pool, normalizedEmail);

      if (existing) {
        throw new ConflictError("An account with this email already exists");
      }

      const passwordHash = await hashPassword(password);
      const user = await createUser(pool, normalizedEmail, passwordHash);

      await issueVerification(user);
    },

    async verify(token) {
      const tokenRow = await findVerificationTokenByHash(pool, hashToken(token));

      if (!tokenRow) {
        throw new ValidationError("Invalid or expired verification token");
      }

      if (tokenRow.consumed_at !== null) {
        throw new ValidationError("This verification link has already been used");
      }

      if (tokenRow.expires_at.getTime() < Date.now()) {
        throw new ValidationError("This verification link has expired");
      }

      await markUserVerified(pool, tokenRow.user_id);
      await consumeVerificationToken(pool, tokenRow.id);
    },

    async resend(email) {
      const user = await findUserByEmail(pool, normalizeEmail(email));

      // Silently succeed for unknown or already-verified accounts to avoid
      // leaking which emails are registered.
      if (!user || user.email_verified) {
        return;
      }

      await issueVerification(user);
    },

    async login(email, password) {
      const user = await findUserByEmail(pool, normalizeEmail(email));

      if (!user) {
        throw new UnauthorizedError("Invalid email or password");
      }

      const passwordOk = await verifyPassword(user.password_hash, password);

      if (!passwordOk) {
        throw new UnauthorizedError("Invalid email or password");
      }

      if (!user.email_verified) {
        throw new ForbiddenError("Please verify your email before logging in");
      }

      return toSafeUser(user);
    },

    async getUserById(id) {
      const user = await findUserById(pool, id);

      return user ? toSafeUser(user) : null;
    },
  };
}
