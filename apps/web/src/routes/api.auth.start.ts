import { createFileRoute } from "@tanstack/react-router";
import { credentialsConfigured, getAuthUrlForRedirect } from "@jack/mail-core";

function callbackUrl(request: Request): string {
  const url = new URL(request.url);
  // Trust the X-Forwarded-* headers behind the exe.dev proxy.
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}/api/auth/callback`;
}

export const Route = createFileRoute("/api/auth/start")({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!credentialsConfigured()) {
          return new Response(
            "OAuth credentials not configured. Place Google OAuth client credentials at " +
              "~/.config/gmail-skill/client-credentials.json on the server.",
            { status: 500, headers: { "Content-Type": "text/plain" } },
          );
        }

        try {
          const redirectUri = callbackUrl(request);
          const authUrl = getAuthUrlForRedirect(redirectUri);
          return Response.redirect(authUrl, 302);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(`Failed to start auth: ${msg}`, {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
      },
    },
  },
});
