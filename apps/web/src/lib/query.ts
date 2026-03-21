import { queryOptions, QueryClient } from "@tanstack/react-query";
import {
  getEmailById,
  getSidebarCounts,
  getThreadEmails,
  getThreadedInboxEmails,
  getUserLabels,
  searchThreadedInboxEmails,
} from "../server/functions";

/** How many emails at the top of the list to eagerly prefetch on load. */
export const PREFETCH_BATCH_SIZE = 5;

/** How many adjacent emails (above + below selection) to prefetch on navigate. */
export const PREFETCH_ADJACENT = 2;

/**
 * Email bodies rarely change — keep them fresh for 10 minutes client-side.
 * This means revisiting an email within 10 min is instant (0 ms).
 */
const EMAIL_STALE_TIME = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Query option factories
// ---------------------------------------------------------------------------

/** Inbox list staleTime — 30 s is long enough to survive rapid j/k navigation. */
const INBOX_STALE_TIME = 30_000;
const SIDEBAR_COUNTS_STALE_TIME = 30_000;

export function inboxQueryOptions(opts: {
  query?: string;
  threadsOnly?: boolean;
  category?: string;
  label?: string;
}) {
  return queryOptions({
    queryKey: inboxQueryKey(opts),
    queryFn: () =>
      opts.query
        ? searchThreadedInboxEmails({
            data: {
              query: opts.query,
              category: opts.category,
              labelId: opts.label,
            },
          })
        : getThreadedInboxEmails({
            data: {
              threadsOnly: !!opts.threadsOnly,
              category: opts.category,
              labelId: opts.label,
            },
          }),
    staleTime: INBOX_STALE_TIME,
    gcTime: 5 * 60 * 1000,
  });
}

export function userLabelsQueryOptions() {
  return queryOptions({
    queryKey: ["email", "labels"],
    queryFn: () => getUserLabels(),
    staleTime: SIDEBAR_COUNTS_STALE_TIME,
    gcTime: 5 * 60 * 1000,
  });
}

export function emailDetailQueryOptions(emailId: string) {
  return queryOptions({
    queryKey: emailDetailQueryKey(emailId),
    queryFn: () => getEmailById({ data: { emailId } }),
    staleTime: EMAIL_STALE_TIME,
    // Keep unused entries in cache for 30 min so back-navigation is instant
    gcTime: 30 * 60 * 1000,
  });
}

export function sidebarCountsQueryOptions() {
  return queryOptions({
    queryKey: ["email", "sidebar-counts"],
    queryFn: () => getSidebarCounts(),
    staleTime: SIDEBAR_COUNTS_STALE_TIME,
    gcTime: 5 * 60 * 1000,
  });
}

export function threadEmailsQueryOptions(threadId: string) {
  return queryOptions({
    queryKey: threadEmailsQueryKey(threadId),
    queryFn: () => getThreadEmails({ data: { threadId } }),
    staleTime: EMAIL_STALE_TIME,
    gcTime: 30 * 60 * 1000,
  });
}

export function inboxQueryKey(opts: {
  query?: string;
  threadsOnly?: boolean;
  category?: string;
  label?: string;
}) {
  return [
    "email",
    "inbox",
    {
      q: opts.query,
      threads: !!opts.threadsOnly,
      category: opts.category,
      label: opts.label,
    },
  ] as const;
}

export function emailDetailQueryKey(emailId: string) {
  return ["email", "detail", emailId] as const;
}

export function threadEmailsQueryKey(threadId: string) {
  return ["email", "thread", threadId] as const;
}

// ---------------------------------------------------------------------------
// Prefetch helpers
// ---------------------------------------------------------------------------

/** Prefetch a single email detail (fire-and-forget, never throws). */
export function prefetchEmailDetail(
  queryClient: QueryClient,
  emailId: string,
) {
  queryClient.prefetchQuery(emailDetailQueryOptions(emailId));
}

/**
 * Prefetch the first N emails from a list.
 * Called after the inbox list loads so the top emails are ready before click.
 */
export function prefetchBatch(
  queryClient: QueryClient,
  emailIds: string[],
  count = PREFETCH_BATCH_SIZE,
) {
  for (const id of emailIds.slice(0, count)) {
    prefetchEmailDetail(queryClient, id);
  }
}

/**
 * Prefetch emails adjacent to the currently selected index.
 * Called when the user navigates j/k or clicks an email.
 */
export function prefetchAdjacent(
  queryClient: QueryClient,
  emailIds: string[],
  selectedIndex: number,
  range = PREFETCH_ADJACENT,
) {
  const start = Math.max(0, selectedIndex - range);
  const end = Math.min(emailIds.length, selectedIndex + range + 1);
  for (let i = start; i < end; i++) {
    if (i === selectedIndex) continue; // already fetching this one
    prefetchEmailDetail(queryClient, emailIds[i]);
  }
}

// ---------------------------------------------------------------------------
// Singleton QueryClient
// ---------------------------------------------------------------------------

let queryClient: QueryClient | undefined;

export function getQueryClient() {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: EMAIL_STALE_TIME,
        },
      },
    });
  }
  return queryClient;
}
