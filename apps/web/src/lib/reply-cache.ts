import type { QueryClient } from "@tanstack/react-query";
import { threadEmailsQueryKey } from "./query";

interface InboxThread {
  id: string;
  threadId: string;
  sender: string;
  subject: string | null;
  snippet: string | null;
  date: number;
  isRead: boolean;
  hasAttachments: boolean;
  threadCount?: number;
}

interface InboxData {
  threads: InboxThread[];
  accountId: string | null;
}

interface ThreadEmail {
  id: string;
  accountId?: string;
  threadId: string;
  subject: string | null;
  sender: string;
  recipients: string[];
  snippet?: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  date: number;
  labels?: string[];
  hasAttachments: boolean;
  isRead: boolean;
}

interface ApplyOptimisticReplyOpts {
  tempId: string;
  threadId: string;
  subject: string;
  body: string;
  to: string[];
  cc: string[];
  sender: string;
}

const OPTIMISTIC_REPLY_PREFIX = "optimistic-reply:";

function buildSnippet(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  return collapsed.length <= 140 ? collapsed : `${collapsed.slice(0, 137)}...`;
}

export function createOptimisticReplyId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${OPTIMISTIC_REPLY_PREFIX}${crypto.randomUUID()}`;
  }

  return `${OPTIMISTIC_REPLY_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function applyOptimisticReply(
  queryClient: QueryClient,
  opts: ApplyOptimisticReplyOpts,
) {
  const now = Math.floor(Date.now() / 1000);
  const snippet = buildSnippet(opts.body);
  const optimisticMessage: ThreadEmail = {
    id: opts.tempId,
    accountId: "default",
    threadId: opts.threadId,
    subject: opts.subject || null,
    sender: opts.sender,
    recipients: [...opts.to, ...opts.cc],
    snippet,
    bodyText: opts.body,
    bodyHtml: null,
    date: now,
    labels: ["SENT"],
    hasAttachments: false,
    isRead: true,
  };

  const threadQueryKey = threadEmailsQueryKey(opts.threadId);
  const hadThreadEmails = !!queryClient.getQueryState(threadQueryKey);
  const previousThreadEmails =
    queryClient.getQueryData<ThreadEmail[]>(threadQueryKey) ?? null;
  const previousInboxQueries = queryClient.getQueriesData<InboxData>({
    queryKey: ["email", "inbox"],
  });

  queryClient.setQueryData<ThreadEmail[]>(
    threadQueryKey,
    (current) => {
      const next = current ? [...current] : [];
      if (!next.some((message) => message.id === opts.tempId)) {
        next.unshift(optimisticMessage);
      }
      next.sort((a, b) => b.date - a.date);
      return next;
    },
  );

  queryClient.setQueriesData<InboxData>(
    { queryKey: ["email", "inbox"] },
    (current) => {
      if (!current) return current;

      let changed = false;
      const threads = current.threads.map((thread) => {
        if (thread.threadId !== opts.threadId) return thread;
        changed = true;
        return {
          ...thread,
          sender: opts.sender,
          subject: opts.subject || thread.subject,
          snippet,
          date: now,
          isRead: true,
          threadCount: Math.max((thread.threadCount ?? 1) + 1, 2),
        };
      });

      return changed ? { ...current, threads } : current;
    },
  );

  return {
    replace(messageId: string) {
      queryClient.setQueryData<ThreadEmail[]>(
        threadQueryKey,
        (current) =>
          current?.map((message) =>
            message.id === opts.tempId ? { ...message, id: messageId } : message,
          ) ?? current,
      );
    },
    rollback() {
      if (hadThreadEmails) {
        queryClient.setQueryData(threadQueryKey, previousThreadEmails);
      } else {
        queryClient.removeQueries({ queryKey: threadQueryKey, exact: true });
      }

      for (const [queryKey, data] of previousInboxQueries) {
        queryClient.setQueryData(queryKey, data);
      }
    },
  };
}
