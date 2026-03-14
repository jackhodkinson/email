import { useRef } from 'react'
import { HeadContent, Scripts, ScriptOnce, createRootRoute, Link, useMatches } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { hotkeysDevtoolsPlugin } from '@tanstack/react-hotkeys-devtools'
import { QueryClientProvider } from '@tanstack/react-query'

import { AppSidebar } from '../components/app-sidebar'
import { SearchBox, type SearchBoxHandle } from '../components/search-box'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '../components/ui/sidebar'
import { SearchBoxContext } from '../lib/search-context'
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
        content: 'width=device-width, initial-scale=1',
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
      <Link to="/" search={{ q: undefined, threads: undefined, category: undefined }} className="link-primary">
        Back to Inbox
      </Link>
    </div>
  )
}

function RootHeader({ searchBoxRef }: { searchBoxRef: React.RefObject<SearchBoxHandle | null> }) {
  const matches = useMatches();
  const search = matches[matches.length - 1]?.search as
    | { q?: string; threads?: boolean }
    | undefined;

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger className="-ml-1" />
      <SearchBox ref={searchBoxRef} query={search?.q} threadsOnly={!!search?.threads} />
    </header>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const searchBoxRef = useRef<SearchBoxHandle>(null);
  const queryClient = getQueryClient();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ScriptOnce>{THEME_INIT_SCRIPT}</ScriptOnce>
        <HotkeysProvider>
          <QueryClientProvider client={queryClient}>
          <ThemeProvider>
          <SearchBoxContext.Provider value={searchBoxRef}>
          <SidebarProvider className="h-full min-h-0">
            <AppSidebar />
            <SidebarInset className="flex flex-col overflow-hidden">
              <RootHeader searchBoxRef={searchBoxRef} />
              <div className="flex-1 min-h-0 overflow-hidden">
                {children}
              </div>
            </SidebarInset>
          </SidebarProvider>
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
              hotkeysDevtoolsPlugin,
            ]}
          />
          <Scripts />
        </HotkeysProvider>
      </body>
    </html>
  )
}
