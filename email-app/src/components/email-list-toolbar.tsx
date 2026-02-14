import { useCallback, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { syncAccount } from "../server/functions";
import { Button } from "./ui/button";

interface EmailListToolbarProps {
  accountId: string;
}

export function EmailListToolbar({ accountId }: EmailListToolbarProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    try {
      await syncAccount({ data: { accountId } });
      await router.invalidate();
    } finally {
      setSyncing(false);
    }
  }, [accountId, router]);

  return (
    <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-b border-border flex-shrink-0">
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
  );
}
