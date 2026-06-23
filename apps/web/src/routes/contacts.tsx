import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { SidebarTrigger } from "../components/ui/sidebar";
import { getContactsList } from "../server/functions";

type SortField =
  | "name"
  | "emails"
  | "threads"
  | "last_contacted"
  | "first_contacted";

export const Route = createFileRoute("/contacts")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
    sort: typeof search.sort === "string" ? (search.sort as SortField) : undefined,
    dir: search.dir === "asc" ? ("asc" as const) : undefined,
  }),
  loaderDeps: ({ search }) => ({
    q: search.q,
    sort: search.sort,
    dir: search.dir,
  }),
  loader: async ({ deps }) => {
    return getContactsList({
      data: { query: deps.q, sort: deps.sort, dir: deps.dir },
    });
  },
  component: ContactsPage,
});

function ContactsPage() {
  const { contacts } = Route.useLoaderData();
  const { q, sort, dir } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const currentSort: SortField = sort || "last_contacted";
  const currentDir = dir || "desc";

  function handleSort(field: SortField) {
    const newDir =
      currentSort === field && currentDir === "desc" ? "asc" : undefined;
    const newSort = field === "last_contacted" ? undefined : field;
    navigate({
      search: { q, sort: newSort, dir: newDir },
    });
  }

  function SortIndicator({ field }: { field: SortField }) {
    if (currentSort !== field) return null;
    return currentDir === "asc" ? (
      <ArrowUp className="size-3" />
    ) : (
      <ArrowDown className="size-3" />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-1" />
          <h1 className="page-header__title">Contacts</h1>
          <span className="page-header__count">{contacts.length}</span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {contacts.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__title">No contacts found</span>
            <span className="empty-state__text">
              {q
                ? "Try a different search term"
                : "Sync your email to see contacts"}
            </span>
          </div>
        ) : (
          <table className="contact-table">
            <thead>
              <tr>
                <th
                  className="contact-table__th cursor-pointer select-none"
                  onClick={() => handleSort("name")}
                >
                  <span className="inline-flex items-center gap-1">
                    Name
                    <SortIndicator field="name" />
                  </span>
                </th>
                <th
                  className="contact-table__th cursor-pointer select-none hidden lg:table-cell"
                  onClick={() => handleSort("emails")}
                >
                  <span className="inline-flex items-center gap-1">
                    Emails
                    <SortIndicator field="emails" />
                  </span>
                </th>
                <th
                  className="contact-table__th cursor-pointer select-none hidden sm:table-cell"
                  onClick={() => handleSort("threads")}
                >
                  <span className="inline-flex items-center gap-1">
                    Threads
                    <SortIndicator field="threads" />
                  </span>
                </th>
                <th
                  className="contact-table__th cursor-pointer select-none"
                  onClick={() => handleSort("last_contacted")}
                >
                  <span className="inline-flex items-center gap-1">
                    Last contacted
                    <SortIndicator field="last_contacted" />
                  </span>
                </th>
                <th
                  className="contact-table__th cursor-pointer select-none hidden md:table-cell"
                  onClick={() => handleSort("first_contacted")}
                >
                  <span className="inline-flex items-center gap-1">
                    First contacted
                    <SortIndicator field="first_contacted" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr
                  key={contact.email}
                  className="contact-table__row"
                  onClick={() =>
                    navigate({
                      to: "/",
                      search: {
                        q: `from:${contact.email}`,
                        threads: undefined,
                        category: undefined,
                        label: undefined,
                        compose: undefined,
                        replyTo: undefined,
                      },
                    })
                  }
                >
                  <td className="contact-table__td">
                    <div className="flex items-center gap-3">
                      <div className="avatar">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 max-w-[55vw] sm:max-w-none">
                        <div className="text-sm font-medium text-truncate">
                          {contact.name}
                        </div>
                        {contact.name !== contact.email && (
                          <div className="text-caption text-truncate">
                            {contact.email}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="contact-table__td tabular-nums hidden lg:table-cell">
                    {contact.messageCount}
                  </td>
                  <td className="contact-table__td tabular-nums hidden sm:table-cell">
                    {contact.threadCount}
                  </td>
                  <td className="contact-table__td">
                    {formatDate(contact.lastContactDate)}
                  </td>
                  <td className="contact-table__td hidden md:table-cell">
                    {formatDate(contact.firstContactDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "\u2014";
  const date = new Date(timestamp * 1000);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
