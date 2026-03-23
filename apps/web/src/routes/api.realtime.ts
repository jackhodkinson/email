import { createFileRoute } from "@tanstack/react-router";
import { subscribeStateChanges } from "@jack/mail-core";

export const Route = createFileRoute("/api/realtime")({
  server: {
    handlers: {
      GET: ({ request }) => {
        let cleanup: (() => void) | null = null;
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            let isClosed = false;

            const send = (event: string, data: unknown) => {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
              );
            };

            const sendHeartbeat = () => {
              controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
            };

            const unsubscribe = subscribeStateChanges((change) => {
              send("invalidate", change);
            });

            send("ready", { ts: Date.now() });
            const heartbeatId = setInterval(sendHeartbeat, 25_000);

            const onAbort = () => {
              if (isClosed) return;
              isClosed = true;
              clearInterval(heartbeatId);
              unsubscribe();
              controller.close();
            };
            cleanup = onAbort;

            request.signal.addEventListener("abort", onAbort, { once: true });
          },
          cancel() {
            cleanup?.();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
