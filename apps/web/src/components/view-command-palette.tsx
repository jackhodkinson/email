import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMatches, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  getActiveMailViewId,
  inboxCategoryViews,
  inboxView,
  secondaryMailViews,
  type MailView,
} from "@/lib/mail-views";
import { sidebarCountsQueryOptions } from "@/lib/query";

interface ViewCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ViewCommandPalette({
  open,
  onOpenChange,
}: ViewCommandPaletteProps) {
  const navigate = useNavigate();
  const matches = useMatches();
  const queryClient = useQueryClient();
  const search = matches[matches.length - 1]?.search as
    | { category?: string }
    | undefined;
  const isContactsRoute = matches.some((match) => match.routeId === "/contacts");
  const activeViewId = getActiveMailViewId({
    category: search?.category,
    isContactsRoute,
  });

  const { data: counts } = useQuery(sidebarCountsQueryOptions());

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: sidebarCountsQueryOptions().queryKey });
    };

    const intervalId = window.setInterval(invalidate, 60_000);
    window.addEventListener("sidebar-counts-changed", invalidate);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("sidebar-counts-changed", invalidate);
    };
  }, [queryClient]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey)) return;

      event.preventDefault();
      onOpenChange(!open);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  const handleSelect = (view: MailView) => {
    onOpenChange(false);

    if (view.route.to === "/contacts") {
      navigate({
        to: view.route.to,
        search: view.route.search,
      });
      return;
    }

    navigate({
      to: view.route.to,
      search: view.route.search,
    });
  };

  const renderItem = (view: MailView) => {
    const count =
      view.countKey && counts && counts[view.countKey] > 0
        ? counts[view.countKey]
        : null;
    const isActive = view.id === activeViewId;

    return (
      <CommandItem
        key={view.id}
        value={[view.title, ...view.keywords].join(" ")}
        onSelect={() => handleSelect(view)}
      >
        <view.icon className="size-4" />
        <span>{view.title}</span>
        {count ? <CommandShortcut>{count}</CommandShortcut> : null}
        {isActive ? <Check className="size-4 text-muted-foreground" /> : null}
      </CommandItem>
    );
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Switch email view">
      <CommandInput placeholder="Switch views..." />
      <CommandList>
        <CommandEmpty>No matching views.</CommandEmpty>
        <CommandGroup heading="Inbox">
          {renderItem(inboxView)}
          {inboxCategoryViews.map(renderItem)}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="More">
          {secondaryMailViews.map(renderItem)}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
