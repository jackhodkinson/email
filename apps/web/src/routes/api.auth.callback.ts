import { createFileRoute } from "@tanstack/react-router";
import { exchangeCodeForTokensWithRedirect } from "@jack/mail-core";

function callbackUrl(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}/api/auth/callback`;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export const Route = createFileRoute("/api/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          return htmlResponse(
            `<!doctype html><meta charset="utf-8"><title>Sign-in cancelled</title>
             <body style="font-family:system-ui;padding:2rem">
             <h1>Sign-in cancelled</h1><p>${escapeHtml(error)}</p>
             <p><a href="/">Back to inbox</a></p></body>`,
            400,
          );
        }

        if (!code) {
          return htmlResponse(
            `<!doctype html><meta charset="utf-8"><title>Missing code</title>
             <body style="font-family:system-ui;padding:2rem">
             <h1>Missing authorization code</h1>
             <p><a href="/api/auth/start">Try again</a></p></body>`,
            400,
          );
        }

        try {
          await exchangeCodeForTokensWithRedirect(code, callbackUrl(request));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return htmlResponse(
            `<!doctype html><meta charset="utf-8"><title>Auth failed</title>
             <body style="font-family:system-ui;padding:2rem">
             <h1>Authentication failed</h1>
             <pre style="white-space:pre-wrap">${escapeHtml(msg)}</pre>
             <p><a href="/api/auth/start">Try again</a></p></body>`,
            500,
          );
        }

        // Tokens saved. Redirect back to the app — `bootstrapAccount` will pick
        // it up and trigger the initial sync.
        return Response.redirect(new URL("/", request.url).toString(), 302);
      },
    },
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
