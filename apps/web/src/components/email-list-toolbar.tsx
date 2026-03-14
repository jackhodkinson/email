import { useCallback } from "react";
import { useObservable, useValue } from "@legendapp/state/react";
import { useRouter } from "@tanstack/react-router";
import { MessagesSquare, RefreshCw, SquarePen } from "lucide-react";
import { syncAccount } from "../server/functions";
import { Button } from "./ui/button";

interface EmailListToolbarProps {
  accountId: string;
  threadsOnly: boolean;
  onToggleThreadsOnly: () => void;
  onComposeNew: () => void;
}

export function EmailListToolbar({
  accountId,
  threadsOnly,
  onToggleThreadsOnly,
  onComposeNew,
}: EmailListToolbarProps) {
  const router = useRouter();
  const syncing$ = useObservable(false);
  const syncing = useValue(syncing$);

  const handleRefresh = useCallback(async () => {
    syncing$.set(true);
    try {
      await syncAccount({ data: { accountId } });
      await router.invalidate();
    } finally {
      syncing$.set(false);
    }
  }, [accountId, router]);

  return (
    <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-border flex-shrink-0">
      <Button
        variant={threadsOnly ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="Filter by threads"
        aria-pressed={threadsOnly}
        onClick={onToggleThreadsOnly}
        title="Show threads only"
      >
        <MessagesSquare />
      </Button>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onComposeNew}>
          <SquarePen />
          Compose
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh emails"
          disabled={syncing}
          onClick={handleRefresh}
        >
          <RefreshCw className={syncing ? "animate-spin" : ""} />
        </Button>
      </div>
    </div>
  );
}
