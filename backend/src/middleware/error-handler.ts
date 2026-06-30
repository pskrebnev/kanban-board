import type { ErrorRequestHandler } from "express";

import { AppError } from "../errors.js";

export type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

/**
 * Central Express error handler. Maps known `AppError`s to their status code
 * and returns a consistent JSON shape; anything else becomes a safe 500 without
 * leaking internal details.
 */
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
      },
    } satisfies ErrorBody);
    return;
  }

  console.error("Unhandled error:", error);

  response.status(500).json({
    error: {
      code: "internal_error",
      message: "Internal server error",
    },
  } satisfies ErrorBody);
};
