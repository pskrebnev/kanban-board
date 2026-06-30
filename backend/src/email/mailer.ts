import nodemailer from "nodemailer";

import type { SmtpConfig } from "../config.js";

export type Mailer = {
  sendVerificationEmail(to: string, verifyUrl: string): Promise<void>;
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
};

function verificationMessage(from: string, to: string, verifyUrl: string) {
  return {
    from,
    to,
    subject: "Verify your Kanban Ticketing account",
    text: `Welcome to Kanban Ticketing.\n\nConfirm your email within 24 hours by opening this link:\n${verifyUrl}\n`,
    html: `<p>Welcome to Kanban Ticketing.</p><p>Confirm your email within 24 hours by opening this link:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
  };
}

function passwordResetMessage(from: string, to: string, resetUrl: string) {
  return {
    from,
    to,
    subject: "Reset your Kanban Ticketing password",
    text: `We received a request to reset your Kanban Ticketing password.\n\nReset it within 1 hour by opening this link:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.\n`,
    html: `<p>We received a request to reset your Kanban Ticketing password.</p><p>Reset it within 1 hour by opening this link:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`,
  };
}

/** Real SMTP mailer (Nodemailer). Configured from environment; supports relay1.dataart.com. */
export function createSmtpMailer(smtp: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password ?? "" } : undefined,
  });

  return {
    async sendVerificationEmail(to, verifyUrl) {
      await transport.sendMail(verificationMessage(smtp.from, to, verifyUrl));
    },
    async sendPasswordResetEmail(to, resetUrl) {
      await transport.sendMail(passwordResetMessage(smtp.from, to, resetUrl));
    },
  };
}

/** Fallback mailer used when SMTP is not configured: logs the link instead of sending. */
export function createConsoleMailer(): Mailer {
  return {
    async sendVerificationEmail(to, verifyUrl) {
      console.log(`[email] Verification link for ${to}: ${verifyUrl}`);
    },
    async sendPasswordResetEmail(to, resetUrl) {
      console.log(`[email] Password reset link for ${to}: ${resetUrl}`);
    },
  };
}
