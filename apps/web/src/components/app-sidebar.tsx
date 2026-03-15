import { useState, useEffect, useCallback } from "react";
import { Link, useMatches } from "@tanstack/react-router";
import {
  Archive,
  ChevronRight,
  Inbox,
  Mail,
  Tag,
  Users,
  Bell,
  MessagesSquare,
  Star,
} from "lucide-react";

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
import { getSidebarCounts } from "@/server/functions";

type SidebarCounts = Awaited<ReturnType<typeof getSidebarCounts>>;

const inboxCategories = [
  { title: "Primary", category: "primary", icon: Mail },
  { title: "Promotions", category: "promotions", icon: Tag },
  { title: "Social", category: "social", icon: Users },
  { title: "Updates", category: "updates", icon: Bell },
  { title: "Forums", category: "forums", icon: MessagesSquare },
];

export function AppSidebar() {
  const matches = useMatches();
  const search = matches[matches.length - 1]?.search as
    | { category?: string }
    | undefined;
  const activeCategory = search?.category;

  const [counts, setCounts] = useState<SidebarCounts | null>(null);
  const fetchCounts = useCallback(() => {
    getSidebarCounts().then(setCounts);
  }, []);
  useEffect(() => {
    fetchCounts();
    const id = setInterval(fetchCounts, 60_000);
    window.addEventListener("sidebar-counts-changed", fetchCounts);
    return () => {
      clearInterval(id);
      window.removeEventListener("sidebar-counts-changed", fetchCounts);
    };
  }, [fetchCounts]);

  const isInboxCategoryActive = inboxCategories.some(
    (item) => item.category === activeCategory,
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" search={{ q: undefined, threads: undefined, category: undefined }}>
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Inbox className="size-4" />
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
                    <CollapsibleTrigger className="flex items-center justify-center size-6 shrink-0 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground">
                      <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </CollapsibleTrigger>
                    <SidebarMenuButton
                      asChild
                      isActive={!activeCategory || isInboxCategoryActive}
                      tooltip="Inbox"
                      className="flex-1"
                    >
                      <Link to="/" search={{ q: undefined, threads: undefined, category: undefined }}>
                        <Inbox />
                        <span className="flex-1">Inbox</span>
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
                      {inboxCategories.map((item) => (
                        <SidebarMenuSubItem key={item.category}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={activeCategory === item.category}
                          >
                            <Link
                              to="/"
                              search={{ category: item.category, q: undefined, threads: undefined }}
                            >
                              <item.icon />
                              <span className="flex-1">{item.title}</span>
                              {counts &&
                                counts[item.category as keyof SidebarCounts] > 0 && (
                                  <span className="text-xs tabular-nums text-sidebar-foreground/70">
                                    {counts[item.category as keyof SidebarCounts]}
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

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={activeCategory === "starred"}
                  tooltip="Starred"
                >
                  <Link
                    to="/"
                    search={{ category: "starred", q: undefined, threads: undefined }}
                  >
                    <Star />
                    <span className="flex-1">Starred</span>
                    {counts && counts.starred > 0 && (
                      <span className="text-xs tabular-nums text-sidebar-foreground/70">
                        {counts.starred}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={activeCategory === "archive"}
                  tooltip="Archive"
                >
                  <Link
                    to="/"
                    search={{ category: "archive", q: undefined, threads: undefined }}
                  >
                    <Archive />
                    <span>Archive</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
