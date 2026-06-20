import { describe, expect, it } from "vitest";
import { getNextEmailIdAfterArchive } from "./archive-selection";

const emails = [
  { id: "email-1" },
  { id: "email-2" },
  { id: "email-3" },
  { id: "email-4" },
];

describe("getNextEmailIdAfterArchive", () => {
  it("selects the email below the archived email", () => {
    expect(getNextEmailIdAfterArchive(emails, ["email-2"], "email-2")).toBe(
      "email-3",
    );
  });

  it("falls back to the previous email when archiving the last email", () => {
    expect(getNextEmailIdAfterArchive(emails, ["email-4"], "email-4")).toBe(
      "email-3",
    );
  });

  it("uses the focused archived email as the anchor for multi-archive", () => {
    expect(
      getNextEmailIdAfterArchive(
        emails,
        ["email-1", "email-2"],
        "email-2",
      ),
    ).toBe("email-3");
  });

  it("returns null when no emails remain", () => {
    expect(
      getNextEmailIdAfterArchive(emails, emails.map((email) => email.id)),
    ).toBeNull();
  });
});
