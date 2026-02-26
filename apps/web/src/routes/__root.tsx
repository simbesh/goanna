import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { useState } from 'react'
import { ThemeProvider } from 'tanstack-theme-kit'
import { Toaster } from 'sileo'

import { BellRing, Radar } from 'lucide-react'
import appCss from '../styles.css?url'

import { RuntimeSettingsRequiredDialog } from '@/components/runtime-settings-required-dialog'
import '@/lib/api'

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
        title: 'Goanna - monitor the web',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      { rel: 'manifest', href: '/manifest.json', color: '#fffff' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),

  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur">
              <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
                  <Radar className="h-4 w-4" />
                  Goanna
                </div>
                <nav className="flex items-center gap-2 text-sm">
                  <Link
                    to="/"
                    className="rounded-md px-3 py-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    activeProps={{
                      className:
                        'rounded-md bg-muted px-3 py-2 text-foreground',
                    }}
                  >
                    Monitors
                  </Link>
                  <Link
                    to="/settings"
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    activeProps={{
                      className:
                        'inline-flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-foreground',
                    }}
                  >
                    <BellRing className="h-4 w-4" />
                    Settings
                  </Link>
                </nav>
              </div>
            </header>
            <Toaster position="bottom-right" theme="light" />
            <RuntimeSettingsRequiredDialog />
            <main className="mx-auto w-full max-w-6xl px-4 py-8">
              {children}
            </main>

            <TanStackDevtools
              config={{
                position: 'bottom-left',
              }}
              plugins={[
                {
                  name: 'Tanstack Router',
                  render: <TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
          </ThemeProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
