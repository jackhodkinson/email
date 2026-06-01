import { useCallback } from "react";
import { useObservable, useValue } from "@legendapp/state/react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, MessagesSquare, RefreshCw, SquarePen } from "lucide-react";
import { syncAccount } from "../server/functions";
import { Button } from "./ui/button";
import { useSidebar } from "./ui/sidebar";

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
  const queryClient = useQueryClient();
  const { setOpenMobile } = useSidebar();
  const syncing$ = useObservable(false);
  const syncing = useValue(syncing$);

  const handleRefresh = useCallback(async () => {
    syncing$.set(true);
    try {
      await syncAccount({ data: { accountId } });
      // Invalidate the React Query inbox cache so ensureQueryData in the
      // /email/$id loader actually refetches instead of returning stale data.
      await queryClient.invalidateQueries({ queryKey: ["email", "inbox"] });
      await router.invalidate();
    } finally {
      syncing$.set(false);
    }
  }, [accountId, queryClient, router]);

  return (
    <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-border flex-shrink-0">
      {/* Mobile: open the full-screen sidebar. Desktop: keep the threads-only toggle. */}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Open navigation"
        onClick={() => setOpenMobile(true)}
        title="Menu"
        className="lg:hidden"
      >
        <Menu />
      </Button>
      <Button
        variant={threadsOnly ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="Filter by threads"
        aria-pressed={threadsOnly}
        onClick={onToggleThreadsOnly}
        title="Show threads only"
        className="hidden lg:inline-flex"
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
