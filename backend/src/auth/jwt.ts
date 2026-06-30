import jwt from "jsonwebtoken";

export type SessionClaims = {
  sub: string;
  email: string;
};

const SESSION_TTL = "7d";

export function signSession(claims: SessionClaims, secret: string): string {
  return jwt.sign({ email: claims.email }, secret, {
    subject: claims.sub,
    expiresIn: SESSION_TTL,
  });
}

export function verifySession(token: string, secret: string): SessionClaims | null {
  try {
    const decoded = jwt.verify(token, secret);

    if (
      typeof decoded === "object" &&
      decoded !== null &&
      typeof decoded.sub === "string" &&
      typeof (decoded as { email?: unknown }).email === "string"
    ) {
      return {
        sub: decoded.sub,
        email: (decoded as { email: string }).email,
      };
    }

    return null;
  } catch {
    return null;
  }
}
