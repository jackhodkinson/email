import { createFileRoute } from "@tanstack/react-router";
import { getInboxEmails } from "../server/functions";
import { EmailList } from "../components/email-list";

export const Route = createFileRoute("/")({
  loader: async () => {
    return await getInboxEmails({ data: {} });
  },
  component: InboxPage,
});

function InboxPage() {
  const { emails, accountId } = Route.useLoaderData();

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
        <EmailList emails={emails} />
      </main>
    </div>
  );
}
