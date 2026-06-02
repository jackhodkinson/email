import { createFileRoute } from "@tanstack/react-router";
import * as core from "@jack/mail-core";

export const Route = createFileRoute("/api/inline/$emailId/$attachmentId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { emailId, attachmentId } = params;
          const bytes = await core.downloadAttachment(emailId, attachmentId);
          // Look up mime for content-type. getEmail is cached on Gmail side; cheap.
          const meta = (await core.getEmail(emailId)).attachments.find(
            (a) => a.attachmentId === attachmentId,
          );
          const mimeType = meta?.mimeType || "application/octet-stream";
          return new Response(new Uint8Array(bytes), {
            headers: {
              "Content-Type": mimeType,
              "Cache-Control": "private, max-age=3600",
              "Content-Length": String(bytes.byteLength),
            },
          });
        } catch (err) {
          return new Response(
            `Failed to load attachment: ${err instanceof Error ? err.message : String(err)}`,
            { status: 404 },
          );
        }
      },
    },
  },
});
