import { useEffect, useState } from "react";
import { Link, useLocation, useMatches, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, PencilLine, Plus, Search, Settings, SquarePen, Tag } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { LabelDialog } from "@/components/label-dialog";
import {
  createLabelAction,
  deleteLabelAction,
  updateLabelAction,
} from "@/server/functions";
import {
  getActiveMailViewId,
  inboxCategoryViews,
  inboxView,
  secondaryMailViews,
} from "@/lib/mail-views";
import { sidebarCountsQueryOptions, userLabelsQueryOptions } from "@/lib/query";

type SidebarLabel = {
  id: string;
  name: string;
  unread: number;
};

export function AppSidebar() {
  const navigate = useNavigate();
  const matches = useMatches();
  const queryClient = useQueryClient();
  const { setOpenMobile } = useSidebar();

  // On mobile the sidebar is an overlay sheet; dismiss it once the user
  // navigates so they land on the destination instead of the open sheet.
  const locationHref = useLocation({ select: (location) => location.href });
  useEffect(() => {
    setOpenMobile(false);
  }, [locationHref, setOpenMobile]);
  const search = matches[matches.length - 1]?.search as
    | { category?: string; label?: string }
    | undefined;
  const activeCategory = search?.category;
  const activeLabelId = search?.label;
  const isContactsRoute = matches.some(
    (m) => m.routeId === "/contacts",
  );
  const isSettingsRoute = matches.some(
    (m) => m.routeId === "/settings",
  );
  const isSearchRoute = matches.some(
    (m) => m.routeId === "/search",
  );
  const activeViewId = getActiveMailViewId({
    category: activeCategory,
    label: activeLabelId,
    isContactsRoute,
  });
  const { data: counts } = useQuery(sidebarCountsQueryOptions());
  const { data: labelData } = useQuery(userLabelsQueryOptions());
  const allLabels = labelData?.labels ?? [];
  const inboxLabels = allLabels.filter((l) => l.name.startsWith("Cmail/"));
  const labels = allLabels.filter((l) => !l.name.startsWith("Cmail/"));
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<SidebarLabel | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const resetDialog = () => {
    setDialogMode(null);
    setSelectedLabel(null);
    setDialogError(null);
  };

  const refreshSidebarData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sidebarCountsQueryOptions().queryKey }),
      queryClient.invalidateQueries({ queryKey: userLabelsQueryOptions().queryKey }),
      queryClient.invalidateQueries({ queryKey: ["email", "inbox"] }),
    ]);
  };

  const createLabelMutation = useMutation({
    mutationFn: async (name: string) => createLabelAction({ data: { name } }),
    onSuccess: async (created) => {
      await refreshSidebarData();
      resetDialog();
      navigate({
        to: "/",
        search: {
          q: undefined,
          threads: undefined,
          category: undefined,
          label: created.id,
          compose: undefined,
          replyTo: undefined,
        },
      });
    },
    onError: (error) => {
      setDialogError(error instanceof Error ? error.message : "Failed to create label.");
    },
  });

  const updateLabelMutation = useMutation({
    mutationFn: async (input: { labelId: string; name: string }) =>
      updateLabelAction({ data: input }),
    onSuccess: async () => {
      await refreshSidebarData();
      resetDialog();
    },
    onError: (error) => {
      setDialogError(error instanceof Error ? error.message : "Failed to save label.");
    },
  });

  const deleteLabelMutation = useMutation({
    mutationFn: async (labelId: string) => deleteLabelAction({ data: { labelId } }),
    onSuccess: async (_data, labelId) => {
      await refreshSidebarData();
      if (activeLabelId === labelId) {
        navigate({
          to: "/",
          search: {
            q: undefined,
            threads: undefined,
            category: undefined,
            label: undefined,
            compose: undefined,
            replyTo: undefined,
          },
        });
      }
      resetDialog();
    },
    onError: (error) => {
      setDialogError(error instanceof Error ? error.message : "Failed to delete label.");
    },
  });

  const dialogBusy = createLabelMutation.isPending
    || updateLabelMutation.isPending
    || deleteLabelMutation.isPending;

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: sidebarCountsQueryOptions().queryKey });
      queryClient.invalidateQueries({ queryKey: userLabelsQueryOptions().queryKey });
    };

    const intervalId = window.setInterval(invalidate, 60_000);
    window.addEventListener("sidebar-counts-changed", invalidate);
    window.addEventListener("labels-changed", invalidate);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("sidebar-counts-changed", invalidate);
      window.removeEventListener("labels-changed", invalidate);
    };
  }, [queryClient]);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex h-10 items-center gap-1 px-2">
          <Link
            to="/"
            search={inboxView.route.search}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Mail className="size-4 shrink-0" />
            <span className="truncate">Mail</span>
          </Link>
          <Link
            to="/search"
            search={{ q: undefined }}
            className={[
              "inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
              isSearchRoute ? "bg-sidebar-accent text-sidebar-accent-foreground" : "",
            ].join(" ")}
            aria-label="Search"
            title="Search"
          >
            <Search className="size-4" />
          </Link>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
            aria-label="Compose"
            title="Compose"
            onClick={() => {
              navigate({
                to: "/",
                search: {
                  q: undefined,
                  threads: undefined,
                  category: undefined,
                  label: undefined,
                  compose: "new",
                  replyTo: undefined,
                },
              });
            }}
          >
            <SquarePen className="size-4" />
          </button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Mail</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {[inboxView, ...inboxCategoryViews, ...secondaryMailViews].map((view) => (
                <SidebarMenuItem key={view.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeViewId === view.id}
                    tooltip={view.title}
                  >
                    {view.route.to === "/contacts" ? (
                      <Link to={view.route.to} search={view.route.search}>
                        <view.icon />
                        <span className="flex-1">{view.title}</span>
                      </Link>
                    ) : (
                      <Link to={view.route.to} search={view.route.search}>
                        <view.icon />
                        <span className="flex-1">{view.title}</span>
                        {counts && view.countKey && counts[view.countKey] > 0 && (
                          <span className="text-xs tabular-nums text-sidebar-foreground/70">
                            {counts[view.countKey]}
                          </span>
                        )}
                      </Link>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {inboxLabels.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Tags</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {inboxLabels.map((label) => (
                  <SidebarMenuItem key={label.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeViewId === `inbox-label:${label.id}`}
                      tooltip={label.name.replace("Cmail/", "")}
                    >
                      <Link
                        to="/"
                        search={{
                          q: undefined,
                          threads: undefined,
                          category: "inbox",
                          label: label.id,
                          compose: undefined,
                          replyTo: undefined,
                        }}
                      >
                        <Tag />
                        <span className="flex-1">{label.name.replace("Cmail/", "")}</span>
                      </Link>
                    </SidebarMenuButton>
                    {label.unread > 0 ? (
                      <SidebarMenuBadge>{label.unread}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Labels</SidebarGroupLabel>
          <SidebarGroupAction
            aria-label="Create label"
            title="Create label"
            onClick={() => {
              setDialogError(null);
              setDialogMode("create");
              setSelectedLabel(null);
            }}
          >
            <Plus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {labels.map((label) => (
                <SidebarMenuItem key={label.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeLabelId === label.id}
                    tooltip={label.name}
                  >
                    <Link
                      to="/"
                      search={{
                        q: undefined,
                        threads: undefined,
                        category: undefined,
                        label: label.id,
                        compose: undefined,
                        replyTo: undefined,
                      }}
                    >
                      <Tag />
                      <span className="flex-1">{label.name}</span>
                    </Link>
                  </SidebarMenuButton>
                  {label.unread > 0 ? (
                    <SidebarMenuBadge>{label.unread}</SidebarMenuBadge>
                  ) : null}
                  <SidebarMenuAction
                    showOnHover
                    aria-label={`Edit ${label.name}`}
                    onClick={() => {
                      setDialogError(null);
                      setDialogMode("edit");
                      setSelectedLabel(label);
                    }}
                  >
                    <PencilLine />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
              {labels.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => {
                      setDialogError(null);
                      setDialogMode("create");
                      setSelectedLabel(null);
                    }}
                  >
                    <Plus />
                    <span>Create label</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isSettingsRoute} tooltip="Settings">
              <Link to="/settings">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      <LabelDialog
        open={dialogMode !== null}
        mode={dialogMode ?? "create"}
        initialName={selectedLabel?.name ?? ""}
        isSubmitting={dialogBusy}
        error={dialogError}
        onOpenChange={(open) => {
          if (!open) resetDialog();
        }}
        onSubmit={async (name) => {
          setDialogError(null);
          if (dialogMode === "edit" && selectedLabel) {
            await updateLabelMutation.mutateAsync({ labelId: selectedLabel.id, name });
            return;
          }
          await createLabelMutation.mutateAsync(name);
        }}
        onDelete={
          dialogMode === "edit" && selectedLabel
            ? async () => {
                setDialogError(null);
                await deleteLabelMutation.mutateAsync(selectedLabel.id);
              }
            : undefined
        }
      />
    </Sidebar>
  );
}
