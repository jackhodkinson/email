import { useCallback, useEffect, useMemo, useState } from "react";
import { useObservable, useValue } from "@legendapp/state/react";
import { useMatches, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  commandPaletteViews,
  getActiveMailViewId,
} from "@/lib/mail-views";
import { userLabelsQueryOptions } from "@/lib/query";
import { isAuthError, notifyAuthError } from "@/lib/auth-error";
import { Menu, MessagesSquare, RefreshCw, Search, SquarePen } from "lucide-react";
import { syncAccount } from "../server/functions";
import { Button } from "./ui/button";
import { useSidebar } from "./ui/sidebar";
import { SearchBox } from "./search-box";
import { useSearchBox } from "@/lib/search-context";

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
  const searchBoxRef = useSearchBox();
  const matches = useMatches();
  const lastMatch = matches[matches.length - 1];
  const search = lastMatch?.search as
    | { q?: string; threads?: boolean; category?: string; label?: string }
    | undefined;
  const isContactsRoute = (lastMatch?.routeId ?? "").startsWith("/contacts");
  const hasActiveQuery = Boolean(search?.q);

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
  const [searchOpen, setSearchOpen] = useState(false);

  // Keep the search bar visible whenever there is an active query.
  useEffect(() => {
    if (hasActiveQuery) setSearchOpen(true);
  }, [hasActiveQuery]);

  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        // Focus the input on the next tick once it has rendered.
        requestAnimationFrame(() => searchBoxRef.current?.focus());
      }
      return next;
    });
  }, [searchBoxRef]);

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
    <>
    <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-b border-border flex-shrink-0">
      {/* Mobile: open the full-screen sidebar. Desktop: keep the threads-only toggle. */}
      <div className="flex items-center gap-1 min-w-0 lg:hidden">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open navigation"
          onClick={() => setOpenMobile(true)}
          title="Menu"
        >
          <Menu />
        </Button>
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
          variant={searchOpen ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label="Search emails"
          aria-expanded={searchOpen}
          onClick={toggleSearch}
          className="lg:hidden"
          title="Search"
        >
          <Search />
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
    {searchOpen && (
      <div className="lg:hidden flex items-center px-2 py-1.5 border-b border-border flex-shrink-0">
        <SearchBox
          ref={searchBoxRef}
          query={search?.q}
          threadsOnly={!!search?.threads}
          category={search?.category}
          label={search?.label}
        />
      </div>
    )}
    </>
  );
}
