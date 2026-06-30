import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 uses Argon2id by default, satisfying the spec requirement for
// an established password-hashing algorithm.

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
