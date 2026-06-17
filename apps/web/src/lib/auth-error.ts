export const AUTH_ERROR_EVENT = "cmail-auth-error";

export function isAuthError(error: unknown): boolean {
  const anyError = error as { message?: unknown; code?: unknown; status?: unknown };
  const message = String(anyError?.message ?? error ?? "");
  return (
    message.includes("AUTH_REQUIRED") ||
    message.includes("invalid_grant") ||
    message.includes("invalid_token") ||
    anyError?.code === 401 ||
    anyError?.status === 401
  );
}

export function notifyAuthError(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT));
}
