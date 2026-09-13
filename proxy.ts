import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextFetchEvent, NextRequest } from 'next/server'
import { checkRequiredEnv } from '@/lib/env-check'
import { isSchemaReady } from '@/lib/db-schema'

// Paths that must stay reachable without a Clerk session.
// - /sign-in, /sign-up: Clerk hosted auth pages
// - /login: legacy URL, redirected to /sign-in
// - /setup: shown when required env vars are missing
// - /api/assets/cleanup: scheduled cleanup job, auth via CRON_SECRET
// - /api/r2-image: media proxy, does its own Clerk-or-signed-token check
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login(.*)',
  '/setup(.*)',
  '/api/assets/cleanup(.*)',
  '/api/r2-image(.*)',
])

const isAuthPage = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/login(.*)'])

const clerkHandler = clerkMiddleware(async (auth, request) => {
  if (request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  if (isPublicRoute(request)) {
    if (isAuthPage(request)) {
      const { userId } = await auth()
      if (userId) return NextResponse.redirect(new URL('/', request.url))
    }
    return
  }

  const { userId } = await auth()
  if (userId) return

  // API callers expect JSON 401, not an HTML redirect.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const signIn = new URL('/sign-in', request.url)
  signIn.searchParams.set('redirect_url', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(signIn)
})

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl

  // First gate: refuse to boot if required env vars are missing. Sends
  // every request to /setup until the install is configured, so a
  // self-hoster sees clear instructions instead of a broken-looking
  // login screen. The /setup page itself, and Next.js static asset
  // requests, are allowed through so the page can render.
  const envCheck = checkRequiredEnv()
  if (!envCheck.ok) {
    if (pathname === '/setup' || pathname.startsWith('/_next/')) {
      return NextResponse.next()
    }
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Setup required', missing: envCheck.missing },
        { status: 503 },
      )
    }
    return NextResponse.redirect(new URL('/setup', request.url))
  }

  // Second gate: the database must have its tables. On a working install
  // this is a cached boolean and costs nothing. On a fresh install it sends
  // people to /setup, which creates the tables and lets them through.
  if (!(await isSchemaReady())) {
    if (pathname === '/setup' || pathname.startsWith('/_next/')) {
      return NextResponse.next()
    }
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Setup required', missing: ['database tables'] },
        { status: 503 },
      )
    }
    return NextResponse.redirect(new URL('/setup', request.url))
  }

  const res = await clerkHandler(request, event)
  return res ?? NextResponse.next()
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files. The image-extension
    // exemption is anchored so paths like `/api/r2-image/foo.png/extra`
    // still go through the proxy.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)$).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
}
