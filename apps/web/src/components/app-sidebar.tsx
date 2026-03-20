import { useEffect } from "react";
import { Link, useMatches } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

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
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getActiveMailViewId,
  inboxCategoryViews,
  inboxView,
  isInboxCategoryView,
  secondaryMailViews,
} from "@/lib/mail-views";
import { sidebarCountsQueryOptions } from "@/lib/query";

export function AppSidebar() {
  const matches = useMatches();
  const queryClient = useQueryClient();
  const search = matches[matches.length - 1]?.search as
    | { category?: string }
    | undefined;
  const activeCategory = search?.category;
  const isContactsRoute = matches.some(
    (m) => m.routeId === "/contacts",
  );
  const activeViewId = getActiveMailViewId({
    category: activeCategory,
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
                      isActive={activeViewId === inboxView.id || isInboxCategoryView(activeCategory)}
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
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
