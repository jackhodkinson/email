import { forwardRef, memo, useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/date";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

// Swipe-to-archive (touch only)
const SWIPE_TRIGGER_PX = 96;
const SWIPE_DIRECTION_LOCK_PX = 8;

interface EmailItemProps {
  id: string;
  email: {
    id: string;
    threadId: string;
    sender: string;
    subject: string | null;
    snippet: string | null;
    date: number;
    isRead: boolean;
    hasAttachments: boolean;
    labels: string[];
  };
  isSelected?: boolean;
  threadCount?: number;
  onSelectEmail?: (id: string) => void;
  onHoverEmail?: (id: string) => void;
  availableLabels?: Array<{ id: string; name: string }>;
  onToggleThreadLabel?: (
    threadId: string,
    labelId: string,
    enabled: boolean,
  ) => void;
  labelsBusy?: boolean;
  onArchive?: (id: string) => void;
}

export const EmailItem = memo(
  forwardRef<HTMLDivElement, EmailItemProps>(function EmailItem(
    {
      id,
      email,
      isSelected,
      threadCount,
      onSelectEmail,
      onHoverEmail,
      availableLabels = [],
      onToggleThreadLabel,
      labelsBusy = false,
      onArchive,
    },
    ref,
  ) {
    const [swipeX, setSwipeX] = useState(0);
    const [animateBack, setAnimateBack] = useState(false);
    const swipeStateRef = useRef<{
      startX: number;
      startY: number;
      active: boolean;
      pointerId: number;
    } | null>(null);
    const suppressClickRef = useRef(false);

    const onPointerDown = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!onArchive || e.pointerType !== "touch") return;
        swipeStateRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          active: false,
          pointerId: e.pointerId,
        };
        setAnimateBack(false);
      },
      [onArchive],
    );

    const onPointerMove = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const state = swipeStateRef.current;
        if (!state || state.pointerId !== e.pointerId) return;
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        if (!state.active) {
          // Lock direction: only horizontal swipes engage; let vertical scroll pass.
          if (Math.abs(dy) > SWIPE_DIRECTION_LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
            swipeStateRef.current = null;
            return;
          }
          if (Math.abs(dx) > SWIPE_DIRECTION_LOCK_PX) {
            state.active = true;
            try {
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
            } catch {}
          } else {
            return;
          }
        }
        // Only allow swipe-left.
        const clamped = Math.min(0, dx);
        setSwipeX(clamped);
        e.preventDefault();
      },
      [],
    );

    const finishSwipe = useCallback(
      (commit: boolean) => {
        const state = swipeStateRef.current;
        swipeStateRef.current = null;
        if (!state) return;
        if (state.active) suppressClickRef.current = true;
        if (commit && state.active && onArchive) {
          // Slide all the way out, then archive.
          setAnimateBack(true);
          setSwipeX(-window.innerWidth);
          window.setTimeout(() => onArchive(id.replace(/^email-/, "")), 180);
          return;
        }
        setAnimateBack(true);
        setSwipeX(0);
      },
      [id, onArchive],
    );

    const onPointerEnd = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const state = swipeStateRef.current;
        if (!state || state.pointerId !== e.pointerId) return;
        const dx = e.clientX - state.startX;
        finishSwipe(state.active && dx <= -SWIPE_TRIGGER_PX);
      },
      [finishSwipe],
    );

    const onClickCapture = useCallback((e: React.MouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    }, []);

    const swiping = swipeX < 0;
    const triggered = swipeX <= -SWIPE_TRIGGER_PX;

    const content = (
      <div
        ref={ref}
        id={id}
        role="option"
        aria-selected={Boolean(isSelected)}
        className={cn(
          "email-item-wrap",
          swiping && "email-item-wrap--swiping",
          triggered && "email-item-wrap--triggered",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture}
      >
      <div className="email-item__swipe-bg" aria-hidden="true">
        <Archive className="size-5" />
        <span className="text-sm">Archive</span>
      </div>
      <div
        className={cn(
          "email-item",
          isSelected && "email-item--selected",
          !email.isRead && "email-item--unread",
        )}
        style={{
          transform: swipeX ? `translate3d(${swipeX}px,0,0)` : undefined,
          transition: animateBack ? "transform 180ms ease-out" : undefined,
        }}
        onClick={() => onSelectEmail?.(email.id)}
        onMouseEnter={() => onHoverEmail?.(email.id)}
      >
        <div className="flex items-start justify-between gap-2 overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* Sender */}
            <div
              className={cn("email-item__sender", !email.isRead && "font-semibold")}
            >
              {formatSender(email.sender)}
            </div>

            {/* Subject */}
            <div
              className={cn(
                "email-item__subject",
                !email.isRead ? "font-medium" : "email-item__subject--read",
              )}
            >
              {email.subject || "(no subject)"}
            </div>

            {/* Snippet */}
            <div className="email-item__snippet">
              {email.snippet}
            </div>
          </div>

          {/* Date and thread count */}
          <div className="flex flex-col items-end gap-1">
            <div className="email-item__date">
              {formatRelativeDate(email.date)}
            </div>
            {threadCount && threadCount > 1 && (
              <span className="badge">
                {threadCount}
              </span>
            )}
          </div>
        </div>

        {/* Unread indicator */}
        {!email.isRead && (
          <div className="unread-dot" />
        )}
      </div>
      </div>
    );

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {content}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Apply labels</ContextMenuLabel>
          <ContextMenuSeparator />
          {availableLabels.length === 0 ? (
            <div className="text-muted-foreground px-2 py-1.5 text-sm">
              No labels yet
            </div>
          ) : (
            availableLabels.map((label) => {
              const checked = email.labels.includes(label.id);
              return (
                <ContextMenuCheckboxItem
                  key={label.id}
                  checked={checked}
                  disabled={labelsBusy}
                  onCheckedChange={(nextChecked) => {
                    onToggleThreadLabel?.(
                      email.threadId,
                      label.id,
                      nextChecked === true,
                    );
                  }}
                  onSelect={(event) => event.preventDefault()}
                >
                  {label.name}
                </ContextMenuCheckboxItem>
              );
            })
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }),
);

// Extract display name from "Name <email>" format
function formatSender(sender: string): string {
  const match = sender.match(/^(.+?)\s*<[^>]+>$/);
  return match ? match[1].trim() : sender;
}
