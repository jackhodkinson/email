"use client";

import { useCallback, useMemo, useState } from "react";
import { parseEmailAddress } from "./email-address-chip";
import { sendEmailAction } from "../server/functions";
import { Button } from "./ui/button";
import { useRouter } from "@tanstack/react-router";

interface ReplyPanelProps {
  replyToMessageId: string;
  replySender?: string | null;
  replySubject?: string | null;
  onClose: () => void;
}

function toReplyAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  return parseEmailAddress(raw).email;
}

function toReplySubject(raw: string | null | undefined): string {
  if (!raw) return "Re:";
  return /^re:/i.test(raw) ? raw : `Re: ${raw}`;
}

function splitAddressList(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function ReplyPanel({
  replyToMessageId,
  replySender,
  replySubject,
  onClose,
}: ReplyPanelProps) {
  const router = useRouter();
  const [to] = useState(() => toReplyAddress(replySender));
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject] = useState(() => toReplySubject(replySubject));
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(() => {
    if (isSending) return false;
    if (!body.trim()) return false;
    if (!to.trim()) return false;
    if (!subject.trim()) return false;
    return true;
  }, [body, isSending, subject, to]);

  const handleSend = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSend) return;

      setError(null);
      setIsSending(true);
      try {
        await sendEmailAction({
          data: {
            to: splitAddressList(to),
            cc: splitAddressList(cc),
            bcc: splitAddressList(bcc),
            subject,
            body,
            replyToMessageId,
          },
        });
        await router.invalidate();
        onClose();
      } catch (sendError) {
        const message =
          sendError instanceof Error ? sendError.message : "Failed to send email.";
        setError(message);
      } finally {
        setIsSending(false);
      }
    },
    [bcc, body, canSend, cc, onClose, replyToMessageId, router, subject, to],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (canSend) {
          const form = (event.target as HTMLElement).closest("form");
          form?.requestSubmit();
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    },
    [canSend, onClose],
  );

  return (
    <div className="reply-panel">
      <form onSubmit={handleSend} onKeyDown={handleKeyDown} className="flex flex-col">
        {/* Compact header with To + subject summary */}
        <div className="reply-panel__header">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs text-muted-foreground flex-shrink-0">Reply to</span>
            <span className="text-xs font-medium truncate">{to}</span>
            {!showCcBcc && (
              <button
                type="button"
                onClick={() => setShowCcBcc(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                +Cc/Bcc
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            Discard
          </button>
        </div>

        {showCcBcc && (
          <>
            <label className="compose-field">
              <span className="compose-field__label">Cc</span>
              <input
                value={cc}
                onChange={(event) => setCc(event.target.value)}
                className="compose-field__input"
              />
            </label>
            <label className="compose-field">
              <span className="compose-field__label">Bcc</span>
              <input
                value={bcc}
                onChange={(event) => setBcc(event.target.value)}
                className="compose-field__input"
              />
            </label>
          </>
        )}

        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write your reply..."
          autoFocus
          className="reply-panel__body"
          rows={4}
        />

        {error && (
          <p className="text-sm text-destructive px-4 py-1" role="alert">
            {error}
          </p>
        )}

        <div className="reply-panel__footer">
          <span className="text-xs text-muted-foreground">
            {typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}+Enter to send
          </span>
          <Button type="submit" size="sm" disabled={!canSend}>
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
