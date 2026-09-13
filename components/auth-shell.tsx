import { SpiteLogo } from '@/components/spite-logo'
import { version as appVersion } from '@/package.json'

const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA || 'dev'
const shortSha = commitSha === 'dev' ? 'dev' : commitSha.slice(0, 7)

export function AuthShell({ children }: { children: React.ReactNode }) {
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
        </div>

        <div className="flex w-full max-w-md flex-col items-stretch lg:items-end">
          {children}
        </div>
      </main>

      <div className="absolute bottom-4 right-5 z-10 text-[12px] text-muted-foreground/60 select-none">
        v{appVersion} · {shortSha}
      </div>
    </div>
  )
}
