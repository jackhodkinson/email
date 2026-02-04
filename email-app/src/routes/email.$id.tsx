import { createFileRoute, Link } from "@tanstack/react-router";
import { getEmailById } from "../server/functions";
import { EmailView } from "../components/email-view";

export const Route = createFileRoute("/email/$id")({
  loader: async ({ params }) => {
    const email = await getEmailById({ data: { emailId: params.id } });
    return { email };
  },
  component: EmailDetailPage,
  notFoundComponent: NotFound,
});

function EmailDetailPage() {
  const { email } = Route.useLoaderData();

  if (!email) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen">
      <EmailView email={email} />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-2xl font-semibold">Email not found</h1>
      <p className="text-muted-foreground">
        The email you're looking for doesn't exist or has been deleted.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to Inbox
      </Link>
    </div>
  );
}
