"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseEmailAddress } from "./email-address-chip";
import { sendEmailAction } from "../server/functions";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { ArrowUp, X } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useFocusManager } from "@/lib/focus-manager";

type ComposeMode = "new" | "reply";

interface ComposeSheetProps {
  open: boolean;
  mode: ComposeMode;
  replyToMessageId?: string;
  replySender?: string | null;
  replySubject?: string | null;
  onOpenChange: (open: boolean) => void;
}

function splitAddressList(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function toReplyAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  return parseEmailAddress(raw).email;
}

function toReplySubject(raw: string | null | undefined): string {
  if (!raw) return "Re:";
  return /^re:/i.test(raw) ? raw : `Re: ${raw}`;
}

export function ComposeSheet({
  open,
  mode,
  replyToMessageId,
  replySender,
  replySubject,
  onOpenChange,
}: ComposeSheetProps) {
  const router = useRouter();
  const focusManager = useFocusManager();
  const toInputRef = useRef<HTMLInputElement>(null);
  const [to, setTo] = useState(mode === "reply" ? toReplyAddress(replySender) : "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState(
    mode === "reply" ? toReplySubject(replySubject) : "",
  );
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReply = mode === "reply";

  useEffect(() => {
    return focusManager.registerSurface("compose-dialog", () => toInputRef.current);
  }, [focusManager]);

  useEffect(() => {
    if (open) {
      focusManager.activateOverlay("compose-dialog");
      return;
    }

    focusManager.deactivateOverlay("compose-dialog");
  }, [focusManager, open]);

  const canSend = useMemo(() => {
    if (isSending) return false;
    if (!body.trim()) return false;
    if (!to.trim()) return false;
    if (!subject.trim()) return false;
    if (isReply && !replyToMessageId) return false;
    return true;
  }, [body, isReply, isSending, replyToMessageId, subject, to]);

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
            replyToMessageId: isReply ? replyToMessageId : undefined,
          },
        });
        await router.invalidate();
        onOpenChange(false);
      } catch (sendError) {
        const message =
          sendError instanceof Error ? sendError.message : "Failed to send email.";
        setError(message);
      } finally {
        setIsSending(false);
      }
    },
    [bcc, body, canSend, cc, isReply, onOpenChange, replyToMessageId, router, subject, to],
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
    },
    [canSend],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="inset-0 h-full w-full max-w-none translate-x-0 translate-y-0 top-0 left-0 rounded-none border-none gap-0 p-0 flex flex-col"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusManager.deactivateOverlay("compose-dialog");
          requestAnimationFrame(() => {
            focusManager.focusPreferredSurface();
          });
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{isReply ? "Reply" : "New message"}</DialogTitle>
          <DialogDescription>Compose an email</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSend} onKeyDown={handleKeyDown} className="compose-form">
          <div className="compose-mobile-toolbar" aria-label="Compose actions">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="compose-mobile-toolbar__button"
              disabled={isSending}
              onClick={() => onOpenChange(false)}
              aria-label="Discard draft"
              title="Discard"
            >
              <X />
            </Button>
            <Button
              type="submit"
              variant="ghost"
              size="icon-lg"
              className="compose-mobile-toolbar__button"
              disabled={!canSend}
              aria-label={isSending ? "Sending" : "Send message"}
              title="Send"
            >
              <ArrowUp />
            </Button>
          </div>

          <div className="compose-scroll">
            {/* To field */}
            <label className="compose-field">
              <span className="compose-field__label">To</span>
              <input
                ref={toInputRef}
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="Recipients"
                autoFocus
                readOnly={isReply}
                className="compose-field__input"
              />
              {!showCcBcc && (
                <button
                  type="button"
                  onClick={() => setShowCcBcc(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
                >
                  Cc Bcc
                </button>
              )}
            </label>

            {/* Cc field */}
            {showCcBcc && (
              <label className="compose-field">
                <span className="compose-field__label">Cc</span>
                <input
                  value={cc}
                  onChange={(event) => setCc(event.target.value)}
                  className="compose-field__input"
                />
              </label>
            )}

            {/* Bcc field */}
            {showCcBcc && (
              <label className="compose-field">
                <span className="compose-field__label">Bcc</span>
                <input
                  value={bcc}
                  onChange={(event) => setBcc(event.target.value)}
                  className="compose-field__input"
                />
              </label>
            )}

            {/* Subject field */}
            <label className="compose-field">
              <span className="compose-field__label">Subject</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject"
                readOnly={isReply}
                className="compose-field__input"
              />
            </label>

            {/* Body */}
            <div className="flex-1 min-h-0 flex flex-col">
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={isReply ? "Write your reply..." : ""}
                className="compose-body"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive px-4 py-2" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="compose-footer">
            <span className="text-xs text-muted-foreground">
              {navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}+Enter to send
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSending}
                onClick={() => onOpenChange(false)}
              >
                Discard
              </Button>
              <Button type="submit" size="sm" disabled={!canSend}>
                {isSending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
