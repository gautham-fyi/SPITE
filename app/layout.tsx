import type { Metadata, Viewport } from 'next'
import { Montserrat, Inter, Geist, Geist_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { clerkAppearance } from '@/lib/clerk-appearance'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-montserrat',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'ztory — stories, stills, and motion',
  description: 'A canvas for AI filmmaking. Your keys. Your models. Your cut.',
}

// Lock zoom so the canvas (and the mobile app) don't pinch/double-tap zoom the
// page out from under you — it's a tool, not a content page. Desktop browsers
// ignore user-scalable; this mainly tames mobile.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

// Suppress ResizeObserver errors (common with React Flow)
if (typeof window !== 'undefined') {
  const resizeObserverErr = window.onerror
  window.onerror = (msg, ...args) => {
    if (typeof msg === 'string' && msg.includes('ResizeObserver')) return true
    return resizeObserverErr ? resizeObserverErr(msg, ...args) : false
  }
}

function ClerkRoot({ children }: { children: React.ReactNode }) {
  // Setup page must render even before Clerk keys exist.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return children
  return (
    <ClerkProvider dynamic appearance={clerkAppearance}>
      {children}
    </ClerkProvider>
  )
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark bg-background" suppressHydrationWarning>
      <body className={`${montserrat.variable} ${inter.variable} ${geist.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground min-h-screen`} suppressHydrationWarning>
        <ClerkRoot>
          <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false} disableTransitionOnChange>
            {children}
            <Toaster position="bottom-right" />
          </ThemeProvider>
        </ClerkRoot>
      </body>
    </html>
  )
}
