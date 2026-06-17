import { forwardRef, memo, useCallback, useEffect, useRef, useState } from "react";
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
//
// The important UX detail here is axis intent: a mailbox list is primarily a
// vertical scroller, so we only steal the pointer after the user has made a
// clearly leftward, mostly-horizontal gesture.  Once locked, translation starts
// from the lock point instead of the original touch-down point; this avoids the
// small but perceptible "jump" that happens when a delayed gesture suddenly
// catches up to the finger.
const SWIPE_INTENT_PX = 18;
const SWIPE_VERTICAL_CANCEL_PX = 10;
const SWIPE_HORIZONTAL_DOMINANCE = 1.35;
const SWIPE_FAST_VELOCITY_PX_PER_MS = 0.9;
const SWIPE_MAX_OFFSET_PX = 280;
const SWIPE_ARCHIVE_ANIMATION_MS = 180;

function getSwipeTriggerPx(width: number): number {
  // Far enough to feel intentional on phones, but not absurdly far on tablets.
  return Math.min(220, Math.max(144, width * 0.45));
}

function easeSwipeOffset(distance: number, trigger: number): number {
  if (distance <= trigger) return distance;

  // Rubber-band beyond the trigger: keep moving with the finger, but slow down
  // so the row feels anchored instead of slippery.
  const extra = distance - trigger;
  return Math.min(SWIPE_MAX_OFFSET_PX, trigger + extra * 0.35);
}

type SwipePhase = "idle" | "tracking" | "dragging" | "committing";

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
    const [swipePhase, setSwipePhase] = useState<SwipePhase>("idle");
    const [swipeTriggerPx, setSwipeTriggerPx] = useState(Number.POSITIVE_INFINITY);
    const swipeStateRef = useRef<{
      startX: number;
      startY: number;
      lockX: number;
      lastX: number;
      lastTime: number;
      velocityX: number;
      triggerPx: number;
      pointerId: number;
      phase: Exclude<SwipePhase, "idle" | "committing">;
    } | null>(null);
    const archiveTimerRef = useRef<number | null>(null);
    const suppressClickRef = useRef(false);

    useEffect(() => {
      return () => {
        if (archiveTimerRef.current !== null) {
          window.clearTimeout(archiveTimerRef.current);
        }
      };
    }, []);

    const onPointerDown = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!onArchive || e.pointerType !== "touch" || swipePhase === "committing") return;
        if (archiveTimerRef.current !== null) {
          window.clearTimeout(archiveTimerRef.current);
          archiveTimerRef.current = null;
        }
        const width = e.currentTarget.getBoundingClientRect().width || window.innerWidth;
        const triggerPx = getSwipeTriggerPx(width);
        setSwipeTriggerPx(triggerPx);
        swipeStateRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          lockX: e.clientX,
          lastX: e.clientX,
          lastTime: e.timeStamp,
          velocityX: 0,
          triggerPx,
          pointerId: e.pointerId,
          phase: "tracking",
        };
        setSwipePhase("tracking");
      },
      [onArchive, swipePhase],
    );

    const onPointerMove = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const state = swipeStateRef.current;
        if (!state || state.pointerId !== e.pointerId) return;

        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const dt = Math.max(1, e.timeStamp - state.lastTime);
        state.velocityX = (e.clientX - state.lastX) / dt;
        state.lastX = e.clientX;
        state.lastTime = e.timeStamp;

        if (state.phase === "tracking") {
          // Vertical-first movement is scroll, not archive. Requiring horizontal
          // dominance makes accidental diagonal pull-to-scroll gestures harmless.
          if (absDy >= SWIPE_VERTICAL_CANCEL_PX && absDy > absDx / SWIPE_HORIZONTAL_DOMINANCE) {
            swipeStateRef.current = null;
            setSwipeTriggerPx(Number.POSITIVE_INFINITY);
            setSwipePhase("idle");
            return;
          }

          const hasHorizontalIntent =
            dx <= -SWIPE_INTENT_PX && absDx >= absDy * SWIPE_HORIZONTAL_DOMINANCE;
          if (!hasHorizontalIntent) return;

          state.phase = "dragging";
          state.lockX = e.clientX;
          suppressClickRef.current = true;
          setSwipePhase("dragging");
          try {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
          } catch {}
          return;
        }

        const distance = Math.max(0, state.lockX - e.clientX);
        setSwipeX(-easeSwipeOffset(distance, state.triggerPx));
        e.preventDefault();
      },
      [],
    );

    const finishSwipe = useCallback(
      (commit: boolean) => {
        const state = swipeStateRef.current;
        swipeStateRef.current = null;
        if (!state) return;

        if (state.phase !== "dragging") {
          setSwipeTriggerPx(Number.POSITIVE_INFINITY);
          setSwipePhase("idle");
          return;
        }

        if (commit && onArchive) {
          setSwipeTriggerPx(0);
          setSwipePhase("committing");
          setSwipeX(-window.innerWidth);
          archiveTimerRef.current = window.setTimeout(() => {
            archiveTimerRef.current = null;
            onArchive(id.replace(/^email-/, ""));
          }, SWIPE_ARCHIVE_ANIMATION_MS);
          return;
        }

        setSwipeTriggerPx(Number.POSITIVE_INFINITY);
        setSwipePhase("idle");
        setSwipeX(0);
      },
      [id, onArchive],
    );

    const onPointerEnd = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const state = swipeStateRef.current;
        if (!state || state.pointerId !== e.pointerId) return;
        const distance = state.phase === "dragging" ? Math.max(0, state.lockX - e.clientX) : 0;
        const passedTrigger = distance >= state.triggerPx;
        const strongFling =
          distance >= state.triggerPx * 0.6 && state.velocityX <= -SWIPE_FAST_VELOCITY_PX_PER_MS;
        finishSwipe(passedTrigger || strongFling);
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

    const swiping = swipePhase === "dragging" || swipePhase === "committing" || swipeX < 0;
    const triggered = swipePhase === "committing" || Math.abs(swipeX) >= swipeTriggerPx;
    const settling = swipePhase === "idle" || swipePhase === "committing";

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
          transition: settling ? `transform ${SWIPE_ARCHIVE_ANIMATION_MS}ms ease-out` : undefined,
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
