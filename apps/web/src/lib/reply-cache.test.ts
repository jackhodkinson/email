import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { applyOptimisticReply } from "./reply-cache";
import { threadEmailsQueryKey } from "./query";

describe("applyOptimisticReply", () => {
  it("adds an optimistic reply to the thread and inbox caches", () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(threadEmailsQueryKey("thread-1"), [
      {
        id: "msg-1",
        threadId: "thread-1",
        subject: "Subject",
        sender: "Alice <alice@example.com>",
        recipients: ["me@example.com"],
        bodyText: "Original",
        bodyHtml: null,
        date: 100,
        hasAttachments: false,
        isRead: true,
      },
    ]);
    queryClient.setQueryData(
      ["email", "inbox", { q: undefined, threads: false, category: undefined, label: undefined }],
      {
        accountId: "default",
        threads: [
          {
            id: "msg-1",
            threadId: "thread-1",
            sender: "Alice <alice@example.com>",
            subject: "Subject",
            snippet: "Original",
            date: 100,
            isRead: false,
            hasAttachments: false,
            threadCount: 1,
          },
        ],
      },
    );

    const optimistic = applyOptimisticReply(queryClient, {
      tempId: "optimistic-1",
      threadId: "thread-1",
      subject: "Re: Subject",
      body: "Thanks for the update",
      to: ["alice@example.com"],
      cc: [],
      sender: "You",
    });

    const thread = queryClient.getQueryData<any[]>(threadEmailsQueryKey("thread-1"));
    const inbox = queryClient.getQueriesData<any>({ queryKey: ["email", "inbox"] })[0]?.[1];

    expect(thread).toHaveLength(2);
    expect(thread?.[0]).toMatchObject({
      id: "optimistic-1",
      sender: "You",
      bodyText: "Thanks for the update",
    });
    expect(inbox?.threads[0]).toMatchObject({
      sender: "You",
      subject: "Re: Subject",
      snippet: "Thanks for the update",
      isRead: true,
      threadCount: 2,
    });

    optimistic.replace("gmail-123");

    const replacedThread = queryClient.getQueryData<any[]>(threadEmailsQueryKey("thread-1"));
    expect(replacedThread?.[0]?.id).toBe("gmail-123");
  });

  it("rolls back to the previous cache state on failure", () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(
      ["email", "inbox", { q: undefined, threads: false, category: undefined, label: undefined }],
      {
        accountId: "default",
        threads: [
          {
            id: "msg-1",
            threadId: "thread-1",
            sender: "Alice <alice@example.com>",
            subject: "Subject",
            snippet: "Original",
            date: 100,
            isRead: false,
            hasAttachments: false,
            threadCount: 1,
          },
        ],
      },
    );

    const optimistic = applyOptimisticReply(queryClient, {
      tempId: "optimistic-1",
      threadId: "thread-1",
      subject: "Re: Subject",
      body: "Thanks for the update",
      to: ["alice@example.com"],
      cc: [],
      sender: "You",
    });

    optimistic.rollback();

    expect(queryClient.getQueryData(threadEmailsQueryKey("thread-1"))).toBeUndefined();
    expect(queryClient.getQueriesData<any>({ queryKey: ["email", "inbox"] })[0]?.[1]?.threads[0])
      .toMatchObject({
        sender: "Alice <alice@example.com>",
        snippet: "Original",
        threadCount: 1,
      });
  });
});
