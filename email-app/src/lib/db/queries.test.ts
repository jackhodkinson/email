import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "./client";
import {
  getThreadedEmails,
  getEmailsByThread,
  getEmailsByAccount,
  upsertAccount,
  upsertEmail,
  deleteAccount,
} from "./queries";

const TEST_ACCOUNT_ID = "test-account-threading";

describe("Thread Queries Integration Tests", () => {
  beforeAll(async () => {
    // Create test account
    await upsertAccount({
      id: TEST_ACCOUNT_ID,
      email: "test-threading@example.com",
      access_token: "test-token",
      refresh_token: "test-refresh",
      token_expiry: Date.now() + 3600000,
    });

    // Create test emails with threads
    const now = Math.floor(Date.now() / 1000);

    // Thread 1: 3 emails
    await upsertEmail({
      id: "email-t1-1",
      account_id: TEST_ACCOUNT_ID,
      thread_id: "thread-1",
      subject: "Thread 1 Subject",
      sender: "alice@example.com",
      date: now - 3600, // 1 hour ago
      snippet: "First message in thread 1",
    });
    await upsertEmail({
      id: "email-t1-2",
      account_id: TEST_ACCOUNT_ID,
      thread_id: "thread-1",
      subject: "Re: Thread 1 Subject",
      sender: "bob@example.com",
      date: now - 1800, // 30 min ago
      snippet: "Second message in thread 1",
    });
    await upsertEmail({
      id: "email-t1-3",
      account_id: TEST_ACCOUNT_ID,
      thread_id: "thread-1",
      subject: "Re: Thread 1 Subject",
      sender: "alice@example.com",
      date: now - 600, // 10 min ago
      snippet: "Third message in thread 1",
    });

    // Thread 2: 2 emails
    await upsertEmail({
      id: "email-t2-1",
      account_id: TEST_ACCOUNT_ID,
      thread_id: "thread-2",
      subject: "Thread 2 Subject",
      sender: "charlie@example.com",
      date: now - 7200, // 2 hours ago
      snippet: "First message in thread 2",
    });
    await upsertEmail({
      id: "email-t2-2",
      account_id: TEST_ACCOUNT_ID,
      thread_id: "thread-2",
      subject: "Re: Thread 2 Subject",
      sender: "dave@example.com",
      date: now - 300, // 5 min ago
      snippet: "Second message in thread 2",
    });

    // Thread 3: 1 email (single message)
    await upsertEmail({
      id: "email-t3-1",
      account_id: TEST_ACCOUNT_ID,
      thread_id: "thread-3",
      subject: "Single Email Thread",
      sender: "eve@example.com",
      date: now - 900, // 15 min ago
      snippet: "Only message in thread 3",
    });
  });

  afterAll(async () => {
    // Clean up test data
    await deleteAccount(TEST_ACCOUNT_ID);
  });

  describe("getThreadedEmails", () => {
    it("should return one row per thread with correct thread count", async () => {
      const threads = await getThreadedEmails(TEST_ACCOUNT_ID);

      // Should have 3 threads
      expect(threads.length).toBe(3);

      // Find each thread
      const thread1 = threads.find((t) => t.thread_id === "thread-1");
      const thread2 = threads.find((t) => t.thread_id === "thread-2");
      const thread3 = threads.find((t) => t.thread_id === "thread-3");

      expect(thread1).toBeDefined();
      expect(thread2).toBeDefined();
      expect(thread3).toBeDefined();

      // Check thread counts
      expect(thread1!.thread_count).toBe(3);
      expect(thread2!.thread_count).toBe(2);
      expect(thread3!.thread_count).toBe(1);
    });

    it("should return the most recent email for each thread", async () => {
      const threads = await getThreadedEmails(TEST_ACCOUNT_ID);

      const thread1 = threads.find((t) => t.thread_id === "thread-1");
      const thread2 = threads.find((t) => t.thread_id === "thread-2");
      const thread3 = threads.find((t) => t.thread_id === "thread-3");

      // Most recent email IDs
      expect(thread1!.id).toBe("email-t1-3");
      expect(thread2!.id).toBe("email-t2-2");
      expect(thread3!.id).toBe("email-t3-1");
    });

    it("should order threads by date descending (most recent first)", async () => {
      const threads = await getThreadedEmails(TEST_ACCOUNT_ID);

      // Order should be: thread-2 (5 min ago), thread-1 (10 min ago), thread-3 (15 min ago)
      expect(threads[0].thread_id).toBe("thread-2");
      expect(threads[1].thread_id).toBe("thread-1");
      expect(threads[2].thread_id).toBe("thread-3");
    });

    it("should respect the limit parameter", async () => {
      const threads = await getThreadedEmails(TEST_ACCOUNT_ID, 2);
      expect(threads.length).toBe(2);
    });

    it("should return empty array for non-existent account", async () => {
      const threads = await getThreadedEmails("non-existent-account");
      expect(threads.length).toBe(0);
    });
  });

  describe("getEmailsByThread", () => {
    it("should return all emails in a thread ordered by date ascending", async () => {
      const emails = await getEmailsByThread("thread-1");

      expect(emails.length).toBe(3);
      expect(emails[0].id).toBe("email-t1-1"); // oldest first
      expect(emails[1].id).toBe("email-t1-2");
      expect(emails[2].id).toBe("email-t1-3"); // newest last
    });

    it("should return single email for single-message thread", async () => {
      const emails = await getEmailsByThread("thread-3");

      expect(emails.length).toBe(1);
      expect(emails[0].id).toBe("email-t3-1");
    });

    it("should return empty array for non-existent thread", async () => {
      const emails = await getEmailsByThread("non-existent-thread");
      expect(emails.length).toBe(0);
    });
  });

  describe("getEmailsByAccount (comparison)", () => {
    it("should return all emails (not grouped by thread)", async () => {
      const emails = await getEmailsByAccount(TEST_ACCOUNT_ID);

      // Should have 6 total emails
      expect(emails.length).toBe(6);
    });
  });
});
