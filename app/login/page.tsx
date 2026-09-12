'use client'

import { useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { useAuth } from '@/components/auth-provider'
import { SpiteLogo } from '@/components/spite-logo'
import { version as appVersion } from '@/package.json'

const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA || 'dev'
const shortSha = commitSha === 'dev' ? 'dev' : commitSha.slice(0, 7)

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const { login, isLoading: authLoading } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    const success = await login(password)
    if (!success) {
      setError('Incorrect password')
      setShake(true)
      setTimeout(() => setShake(false), 600)
    }
    setIsLoading(false)
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    )
  }

  const buttonDisabled = isLoading || !password

  return (
    <div className="spite-ozone-bg relative min-h-screen overflow-hidden">
      <div className="spite-grain" aria-hidden="true" />

      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-6">
        <SpiteLogo
          className="h-8 w-auto"
          withWordmark
          wordmarkClassName="text-[18px] font-semibold tracking-tight text-foreground"
        />
        <span className="hidden sm:inline-flex items-center rounded-full bg-[#C4B5FD] px-4 py-2 text-[13px] font-medium text-[#1A1528]">
          Unlock studio
        </span>
      </header>

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-12 px-6 pb-16 pt-6 md:px-10 lg:flex-row lg:items-center lg:justify-between lg:pt-10">
        <div className="max-w-xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Studio × systems
          </p>
          <h1
            className="text-[48px] leading-[0.95] font-semibold tracking-[-0.04em] text-foreground sm:text-[64px] lg:text-[72px]"
            style={{ fontFamily: 'var(--font-geist), var(--font-inter), sans-serif' }}
          >
            Make the
            <br />
            story you
            <br />
            <span className="text-accent">meant to</span>
            <br />
            tell.
          </h1>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-muted-foreground">
            ztory is a canvas for stills, shots, and motion. Your keys, your models, your cut.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex max-w-md flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              disabled={isLoading}
              className={`w-full rounded-full border border-white/10 bg-white/5 px-5 py-3.5 text-[15px] text-foreground placeholder:text-muted-foreground outline-none focus:border-accent/50 ${shake ? 'animate-shake' : ''}`}
            />
            {error && (
              <p className="px-2 text-[14px] text-red-400">{error}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={buttonDisabled}
                className="inline-flex items-center gap-2 rounded-full bg-[#C4B5FD] px-5 py-3 text-[15px] font-medium text-[#1A1528] transition-transform active:scale-[0.98] disabled:opacity-40"
              >
                {isLoading ? 'Unlocking…' : 'Unlock'}
                <ArrowRight size={16} weight="bold" />
              </button>
              <span className="text-[13px] text-muted-foreground">
                Private studio. One password.
              </span>
            </div>
          </form>
        </div>

        <div className="brand-grid-card relative aspect-[16/10] w-full max-w-lg overflow-hidden rounded-3xl lg:aspect-[5/3]">
          <div className="absolute inset-0 flex items-center justify-center">
            <img src="/brand/logo.png" alt="" className="h-28 w-auto drop-shadow-xl" draggable={false} />
          </div>
        </div>
      </main>

      <div className="absolute bottom-4 right-5 z-10 text-[12px] text-muted-foreground/60 select-none">
        v{appVersion} · {shortSha}
      </div>
    </div>
  )
}
