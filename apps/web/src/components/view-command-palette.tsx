import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMatches, useNavigate } from "@tanstack/react-router";
import { Check, Tag } from "lucide-react";

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
import { useFocusManager } from "@/lib/focus-manager";
import {
  getActiveMailViewId,
  inboxCategoryViews,
  inboxView,
  secondaryMailViews,
  type MailView,
} from "@/lib/mail-views";
import { sidebarCountsQueryOptions, userLabelsQueryOptions } from "@/lib/query";

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
  const focusManager = useFocusManager();
  const inputRef = useRef<HTMLInputElement>(null);
  const search = matches[matches.length - 1]?.search as
    | { category?: string; label?: string }
    | undefined;
  const isContactsRoute = matches.some((match) => match.routeId === "/contacts");
  const activeViewId = getActiveMailViewId({
    category: search?.category,
    label: search?.label,
    isContactsRoute,
  });

  const { data: counts } = useQuery(sidebarCountsQueryOptions());
  const { data: labelData } = useQuery(userLabelsQueryOptions());
  const inboxLabels = (labelData?.labels ?? []).filter((l) => l.name.startsWith("Cmail/"));

  useEffect(() => {
    return focusManager.registerSurface("command-palette", () => inputRef.current);
  }, [focusManager]);

  useEffect(() => {
    if (open) {
      focusManager.activateOverlay("command-palette");
      return;
    }

    focusManager.deactivateOverlay("command-palette");
  }, [focusManager, open]);

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
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Switch email view"
      contentProps={{
        onCloseAutoFocus: (event) => {
          event.preventDefault();
          focusManager.deactivateOverlay("command-palette");
          requestAnimationFrame(() => {
            focusManager.focusPreferredSurface();
          });
        },
      }}
    >
      <CommandInput ref={inputRef} placeholder="Switch views..." />
      <CommandList>
        <CommandEmpty>No matching views.</CommandEmpty>
        <CommandGroup heading="Inbox">
          {renderItem(inboxView)}
          {inboxCategoryViews.map(renderItem)}
          {inboxLabels.map((label) => {
            const isActive = activeViewId === `inbox-label:${label.id}`;
            return (
              <CommandItem
                key={label.id}
                value={label.name}
                onSelect={() => {
                  onOpenChange(false);
                  navigate({
                    to: "/",
                    search: {
                      q: undefined,
                      threads: undefined,
                      category: "inbox",
                      label: label.id,
                      compose: undefined,
                      replyTo: undefined,
                    },
                  });
                }}
              >
                <Tag className="size-4" />
                <span>{label.name.replace("Cmail/", "")}</span>
                {label.unread > 0 ? <CommandShortcut>{label.unread}</CommandShortcut> : null}
                {isActive ? <Check className="size-4 text-muted-foreground" /> : null}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="More">
          {secondaryMailViews.map(renderItem)}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
