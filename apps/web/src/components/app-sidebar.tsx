import { useState, useEffect, useCallback } from "react";
import { Link, useMatches } from "@tanstack/react-router";
import {
  Inbox,
  Mail,
  Tag,
  Users,
  Bell,
  MessagesSquare,
  MailOpen,
  Star,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSidebarCounts } from "@/server/functions";

type SidebarCounts = Awaited<ReturnType<typeof getSidebarCounts>>;

const categoryItems = [
  { title: "Primary", category: "primary", icon: Mail },
  { title: "Promotions", category: "promotions", icon: Tag },
  { title: "Social", category: "social", icon: Users },
  { title: "Updates", category: "updates", icon: Bell },
  { title: "Forums", category: "forums", icon: MessagesSquare },
  { title: "Unread", category: "unread", icon: MailOpen },
  { title: "Starred", category: "starred", icon: Star },
];

export function AppSidebar() {
  const matches = useMatches();
  const currentPath = matches[matches.length - 1]?.fullPath ?? "/";
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

  const isInboxActive =
    currentPath === "/" && !activeCategory;

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
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isInboxActive}
                  tooltip="Inbox"
                >
                  <Link to="/" search={{ q: undefined, threads: undefined, category: undefined }}>
                    <Inbox />
                    <span>Inbox</span>
                  </Link>
                </SidebarMenuButton>
                {counts && counts.inbox > 0 && (
                  <SidebarMenuBadge>{counts.inbox}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Categories</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {categoryItems.map((item) => (
                <SidebarMenuItem key={item.category}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeCategory === item.category}
                    tooltip={item.title}
                  >
                    <Link
                      to="/"
                      search={{ category: item.category, q: undefined, threads: undefined }}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {counts &&
                    counts[item.category as keyof SidebarCounts] > 0 && (
                      <SidebarMenuBadge>
                        {counts[item.category as keyof SidebarCounts]}
                      </SidebarMenuBadge>
                    )}
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
