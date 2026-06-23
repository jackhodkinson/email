import { useEffect, useRef, useState } from 'react'
import { HeadContent, Scripts, ScriptOnce, createRootRoute, Link, useMatches, useRouter } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { hotkeysDevtoolsPlugin } from '@tanstack/react-hotkeys-devtools'
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'

import { AppSidebar } from '../components/app-sidebar'
import { ViewCommandPalette } from '../components/view-command-palette'
import { SidebarInset, SidebarProvider } from '../components/ui/sidebar'
import { FocusManagerProvider } from '../lib/focus-manager'
import { SearchBoxContext, type SearchBoxHandle } from '../lib/search-context'
import { getQueryClient } from '../lib/query'
import { ThemeProvider, THEME_INIT_SCRIPT } from '../lib/theme'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),

  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="empty-state">
      <h1 className="empty-state__title">Page not found</h1>
      <p className="empty-state__text">The page you're looking for doesn't exist.</p>
      <Link
        to="/"
        search={{
          q: undefined,
          threads: undefined,
          category: undefined,
          label: undefined,
          compose: undefined,
          replyTo: undefined,
        }}
        className="link-primary"
      >
        Back to Inbox
      </Link>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const searchBoxRef = useRef<SearchBoxHandle>(null);
  const queryClient = getQueryClient();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const matches = useMatches();
  const isSettingsRoute = matches.some((match) => match.routeId === "/settings");

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ScriptOnce>{THEME_INIT_SCRIPT}</ScriptOnce>
        <HotkeysProvider>
          <FocusManagerProvider>
          <QueryClientProvider client={queryClient}>
          <RealtimeInvalidationBridge />
          <ThemeProvider>
          <SearchBoxContext.Provider value={searchBoxRef}>
          {isSettingsRoute ? (
            <div className="h-full min-h-0 overflow-hidden">
              {children}
            </div>
          ) : (
            <SidebarProvider className="h-full min-h-0">
              <AppSidebar />
              <SidebarInset className="flex flex-col overflow-hidden">
                <div className="flex-1 min-h-0 overflow-hidden">
                  {children}
                </div>
              </SidebarInset>
              <ViewCommandPalette
                open={isPaletteOpen}
                onOpenChange={setIsPaletteOpen}
              />
            </SidebarProvider>
          )}
          </SearchBoxContext.Provider>
          </ThemeProvider>
          </QueryClientProvider>
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
              hotkeysDevtoolsPlugin(),
            ]}
          />
          <Scripts />
          </FocusManagerProvider>
        </HotkeysProvider>
      </body>
    </html>
  )
}

function RealtimeInvalidationBridge() {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    let debounceId: ReturnType<typeof setTimeout> | undefined;
    const source = new EventSource("/api/realtime");

    const invalidate = () => {
      if (debounceId) return;
      debounceId = setTimeout(() => {
        debounceId = undefined;
        queryClient.invalidateQueries({ queryKey: ["email"] });
        void router.invalidate();
      }, 150);
    };

    source.addEventListener("invalidate", invalidate);

    return () => {
      source.removeEventListener("invalidate", invalidate);
      source.close();
      if (debounceId) {
        clearTimeout(debounceId);
      }
    };
  }, [queryClient, router]);

  return null;
}
