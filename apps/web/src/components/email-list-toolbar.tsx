import { useCallback, useMemo } from "react";
import { useObservable, useValue } from "@legendapp/state/react";
import { useMatches, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  commandPaletteViews,
  getActiveMailViewId,
} from "@/lib/mail-views";
import { userLabelsQueryOptions } from "@/lib/query";
import { isAuthError, notifyAuthError } from "@/lib/auth-error";
import { MessagesSquare, RefreshCw } from "lucide-react";
import { syncAccount } from "../server/functions";
import { Button } from "./ui/button";
import { SidebarTrigger } from "./ui/sidebar";

interface EmailListToolbarProps {
  accountId: string;
  threadsOnly: boolean;
  onToggleThreadsOnly: () => void;
}

export function EmailListToolbar({
  accountId,
  threadsOnly,
  onToggleThreadsOnly,
}: EmailListToolbarProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const matches = useMatches();
  const lastMatch = matches[matches.length - 1];
  const search = lastMatch?.search as
    | { q?: string; threads?: boolean; category?: string; label?: string }
    | undefined;
  const isContactsRoute = (lastMatch?.routeId ?? "").startsWith("/contacts");

  const { data: labelData } = useQuery(userLabelsQueryOptions());
  const activeViewTitle = useMemo(() => {
    const id = getActiveMailViewId({
      category: search?.category,
      label: search?.label,
      isContactsRoute,
    });
    if (search?.label) {
      const label = labelData?.labels.find((l) => l.id === search.label);
      if (label) return label.name.replace(/^Cmail\//, "");
      return "Label";
    }
    const view = commandPaletteViews.find((v) => v.id === id);
    return view?.title ?? "Inbox";
  }, [isContactsRoute, labelData, search?.category, search?.label]);

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
    } catch (error) {
      if (isAuthError(error)) {
        notifyAuthError();
      }
      console.error("Failed to refresh mail", error);
    } finally {
      syncing$.set(false);
    }
  }, [accountId, queryClient, router]);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border flex-shrink-0">
      <SidebarTrigger className="shrink-0" />
      <div className="flex items-center min-w-0">
        <span
          className="text-sm font-medium truncate min-w-0"
          title={activeViewTitle}
        >
          {activeViewTitle}
        </span>
      </div>
      <Button
        variant={threadsOnly ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="Filter by threads"
        aria-pressed={threadsOnly}
        onClick={onToggleThreadsOnly}
        title="Show threads only"
        className="ml-auto"
      >
        <MessagesSquare />
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
  );
}
