"use client";

import { useCallback, useMemo, useState } from "react";
import { parseEmailAddress } from "./email-address-chip";
import { sendEmailAction } from "../server/functions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useRouter } from "@tanstack/react-router";

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
  const [to, setTo] = useState(mode === "reply" ? toReplyAddress(replySender) : "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(
    mode === "reply" ? toReplySubject(replySubject) : "",
  );
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReply = mode === "reply";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl gap-0 p-0">
        <DialogHeader className="space-y-1 border-b px-4 py-3">
          <DialogTitle>{isReply ? "Reply" : "New message"}</DialogTitle>
          <DialogDescription>
            {isReply
              ? "Reply is threaded automatically from the selected message."
              : "Send a text email from your connected Gmail account."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSend} className="flex max-h-[85vh] min-h-0 flex-col">
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">To</span>
              <Input
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="alice@example.com, bob@example.com"
                autoFocus
                readOnly={isReply}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Cc</span>
              <Input
                value={cc}
                onChange={(event) => setCc(event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Bcc</span>
              <Input
                value={bcc}
                onChange={(event) => setBcc(event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Subject</span>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="(no subject)"
                readOnly={isReply}
              />
            </label>

            <label className="flex min-h-0 flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Message</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={isReply ? "Write your reply..." : "Write your message..."}
                className="min-h-[220px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </label>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="border-t p-4">
            <Button
              type="button"
              variant="ghost"
              disabled={isSending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSend}>
              {isSending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
