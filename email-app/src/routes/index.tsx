import { useState, useCallback, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getInboxEmails } from "../server/functions";
import { EmailList } from "../components/email-list";
import { useKeyboard } from "../lib/hooks/use-keyboard";

export const Route = createFileRoute("/")({
  loader: async () => {
    return await getInboxEmails({ data: {} });
  },
  component: InboxPage,
});

function InboxPage() {
  const { emails, accountId } = Route.useLoaderData();
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => Math.min(prev + 1, emails.length - 1));
  }, [emails.length]);

  const selectPrevious = useCallback(() => {
    setSelectedIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const openSelected = useCallback(() => {
    if (emails.length > 0 && selectedIndex >= 0 && selectedIndex < emails.length) {
      navigate({ to: "/email/$id", params: { id: emails[selectedIndex].id } });
    }
  }, [emails, selectedIndex, navigate]);

  const keyboardHandlers = useMemo(
    () => ({
      ArrowDown: selectNext,
      ArrowUp: selectPrevious,
      Enter: openSelected,
    }),
    [selectNext, selectPrevious, openSelected]
  );

  useKeyboard(keyboardHandlers);

  if (!accountId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-semibold">Welcome to Email</h1>
        <p className="text-muted-foreground">
          No account found. Please run the bootstrap and sync scripts first.
        </p>
        <div className="text-sm text-muted-foreground bg-muted p-4 rounded-md font-mono">
          <p>1. Bootstrap account:</p>
          <p className="ml-4">bun run src/lib/gmail/test-sync.ts</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <span className="text-sm text-muted-foreground">
          {emails.length} emails
        </span>
      </header>

      <main className="h-[calc(100vh-57px)]">
        <EmailList emails={emails} selectedIndex={selectedIndex} />
      </main>
    </div>
  );
}
