import { useRef, useEffect } from "react";
import { EmailItem } from "./email-item";
import { ScrollArea } from "./ui/scroll-area";

interface Email {
  id: string;
  sender: string;
  subject: string | null;
  snippet: string | null;
  date: number;
  isRead: boolean;
  hasAttachments: boolean;
}

interface EmailListProps {
  emails: Email[];
  selectedIndex?: number;
}

export function EmailList({ emails, selectedIndex = -1 }: EmailListProps) {
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view when selection changes
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  if (emails.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No emails found
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="divide-y">
        {emails.map((email, index) => (
          <EmailItem
            key={email.id}
            email={email}
            isSelected={index === selectedIndex}
            ref={index === selectedIndex ? selectedRef : undefined}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
