import type { Database } from "bun:sqlite";

export const AUTH_REQUIRED_MESSAGE =
  "AUTH_REQUIRED: Gmail authorization expired. Please reconnect Google.";

export function isGoogleAuthError(error: unknown): boolean {
  const err = error as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const message = String(err?.message ?? error ?? "");
  return (
    message.includes("invalid_grant") ||
    message.includes("invalid_token") ||
    err?.code === 401 ||
    err?.status === 401 ||
    err?.response?.status === 401
  );
}

export function toAuthRequiredError(error: unknown): Error {
  if (isGoogleAuthError(error)) {
    return new Error(AUTH_REQUIRED_MESSAGE);
  }
  return error instanceof Error ? error : new Error(String(error));
}

export async function withGmail<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[gmail] ${operation} failed`, error);
    throw toAuthRequiredError(error);
  }
}

export async function withGmailMutation<T>(options: {
  operation: string;
  applyLocal?: () => void;
  rollbackLocal?: () => void;
  remote: () => Promise<T>;
}): Promise<T> {
  options.applyLocal?.();
  try {
    return await withGmail(options.operation, options.remote);
  } catch (error) {
    options.rollbackLocal?.();
    throw error;
  }
}

export function assertAuthenticated(
  core: { isAuthenticated: () => boolean },
): void {
  if (!core.isAuthenticated()) {
    throw new Error(AUTH_REQUIRED_MESSAGE);
  }
}

export type LocalDb = Database;
