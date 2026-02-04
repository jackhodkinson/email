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
  selectedId?: string;
}

export function EmailList({ emails, selectedId }: EmailListProps) {
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
        {emails.map((email) => (
          <EmailItem
            key={email.id}
            email={email}
            isSelected={email.id === selectedId}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
