import { Link, useMatches } from "@tanstack/react-router";
import { Inbox, FlaskConical } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const mailItems = [
  {
    title: "Inbox",
    url: "/",
    icon: Inbox,
  },
];

const demoItems = [
  {
    title: "Server Functions",
    url: "/demo/start/server-funcs",
  },
  {
    title: "API Request",
    url: "/demo/start/api-request",
  },
  {
    title: "SSR Demos",
    url: "/demo/start/ssr",
  },
];

export function AppSidebar() {
  const matches = useMatches();
  const currentPath = matches[matches.length - 1]?.fullPath ?? "/";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" search={{ q: undefined, threads: undefined }}>
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
              {mailItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={currentPath === item.url || currentPath.startsWith("/email/")}
                    tooltip={item.title}
                  >
                    <Link to={item.url} search={{ q: undefined, threads: undefined }}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Demos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {demoItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={currentPath === item.url}
                    tooltip={item.title}
                  >
                    <Link to={item.url}>
                      <FlaskConical />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
