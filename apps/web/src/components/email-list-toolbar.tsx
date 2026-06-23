import { useMemo } from "react";
import { useMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  commandPaletteViews,
  getActiveMailViewId,
} from "@/lib/mail-views";
import { userLabelsQueryOptions } from "@/lib/query";
import { ListFilter, MoreHorizontal, SlidersHorizontal } from "lucide-react";
import { Button } from "./ui/button";

export function EmailListToolbar() {
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
  return (
    <div className="flex h-12 items-center gap-2 border-b border-border px-3 flex-shrink-0">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="min-w-0 truncate text-base font-semibold"
          title={activeViewTitle}
        >
          {activeViewTitle}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="More list actions">
          <MoreHorizontal />
        </Button>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Filter mail list">
          <ListFilter />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Mail list settings">
          <SlidersHorizontal />
        </Button>
      </div>
    </div>
  );
}
