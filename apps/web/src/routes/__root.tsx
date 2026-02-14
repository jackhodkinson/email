import { HeadContent, Scripts, createRootRoute, Link } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { hotkeysDevtoolsPlugin } from '@tanstack/react-hotkeys-devtools'

import { AppSidebar } from '../components/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '../components/ui/sidebar'

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
      <Link to="/" search={{ q: undefined, threads: undefined }} className="link-primary">
        Back to Inbox
      </Link>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <HotkeysProvider>
          <SidebarProvider className="h-full min-h-0">
            <AppSidebar />
            <SidebarInset className="flex flex-col overflow-hidden">
              <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
              </header>
              <div className="flex-1 min-h-0 overflow-hidden">
                {children}
              </div>
            </SidebarInset>
          </SidebarProvider>
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
