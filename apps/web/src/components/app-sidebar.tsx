import { useEffect, useState } from "react";
import { Link, useLocation, useMatches, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, PencilLine, Plus, Tag } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { LabelDialog } from "@/components/label-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  createLabelAction,
  deleteLabelAction,
  updateLabelAction,
} from "@/server/functions";
import {
  getActiveMailViewId,
  inboxCategoryViews,
  inboxView,
  isInboxCategoryView,
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
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to={inboxView.route.to} search={inboxView.route.search}>
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                    <inboxView.icon className="size-4" />
                  </div>
                  <span className="font-semibold">Mail</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Mail</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <Collapsible defaultOpen className="group/collapsible">
                <SidebarMenuItem>
                  <div className="flex items-center">
                    <CollapsibleTrigger className="flex items-center justify-center size-6 shrink-0 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                      <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </CollapsibleTrigger>
                    <SidebarMenuButton
                      asChild
                      isActive={activeViewId === inboxView.id || isInboxCategoryView(activeCategory) || activeViewId?.startsWith("inbox-label:")}
                      tooltip={inboxView.title}
                      className="flex-1"
                    >
                      <Link to={inboxView.route.to} search={inboxView.route.search}>
                        <inboxView.icon />
                        <span className="flex-1">{inboxView.title}</span>
                        {counts && counts.inbox > 0 && (
                          <span className="text-xs tabular-nums text-sidebar-foreground/70">
                            {counts.inbox}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </div>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {inboxCategoryViews.map((view) => (
                        <SidebarMenuSubItem key={view.id}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={activeViewId === view.id}
                          >
                            <Link to={view.route.to} search={view.route.search}>
                              <view.icon />
                              <span className="flex-1">{view.title}</span>
                              {counts && view.countKey && counts[view.countKey] > 0 && (
                                  <span className="text-xs tabular-nums text-sidebar-foreground/70">
                                    {counts[view.countKey]}
                                  </span>
                                )}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {secondaryMailViews.map((view) => (
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
        <ThemeToggle />
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
