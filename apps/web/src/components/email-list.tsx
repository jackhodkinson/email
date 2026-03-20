import { useRef, useEffect } from "react";
import type { RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmailItem } from "./email-item";

interface Email {
  id: string;
  sender: string;
  subject: string | null;
  snippet: string | null;
  date: number;
  isRead: boolean;
  hasAttachments: boolean;
  threadCount?: number;
}

interface EmailListProps {
  emails: Email[];
  selectedIndex?: number;
  listRef?: RefObject<HTMLDivElement | null>;
  onSelectEmail?: (id: string) => void;
  onHoverEmail?: (id: string) => void;
}

const ESTIMATED_ROW_HEIGHT = 76;

export function EmailList({
  emails,
  selectedIndex = -1,
  listRef,
  onSelectEmail,
  onHoverEmail,
}: EmailListProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const scrollRef = listRef ?? internalRef;

  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 6,
  });

  const selectedId =
    selectedIndex >= 0 && emails[selectedIndex]
      ? `email-${emails[selectedIndex].id}`
      : undefined;

  // Keep the selected item visible when navigating quickly.
  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < emails.length) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [emails.length, selectedIndex, virtualizer]);

  return (
    <div
      ref={scrollRef}
      role="listbox"
      aria-label="Email messages"
      aria-activedescendant={selectedId}
      tabIndex={-1}
      className="email-list flex-1 min-h-0 overflow-auto"
    >
      {emails.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state__text">No emails found</span>
        </div>
      ) : (
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const email = emails[virtualRow.index];
            if (!email) return null;
            const isSelected = virtualRow.index === selectedIndex;

            return (
              <div
                key={email.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <EmailItem
                  id={`email-${email.id}`}
                  email={email}
                  isSelected={isSelected}
                  threadCount={email.threadCount}
                  onSelectEmail={onSelectEmail}
                  onHoverEmail={onHoverEmail}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
