'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { Receipt } from '@phosphor-icons/react'
import { formatUSD } from '@/lib/fal-cost'
import { PROJECT_SPEND_EVENT } from '@/lib/project-spend'

interface SpendResponse {
  totalUsd?: number
  generations?: number
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function ProjectSpendBadge({ projectId }: { projectId: string }) {
  const { data, isLoading, mutate } = useSWR<SpendResponse>(
    projectId ? `/api/projects/${projectId}/spend` : null,
    fetcher,
    { refreshInterval: 20000, revalidateOnFocus: true },
  )

  useEffect(() => {
    const onSpend = (e: Event) => {
      const id = (e as CustomEvent<{ projectId?: string }>).detail?.projectId
      if (!id || id === projectId) void mutate()
    }
    window.addEventListener(PROJECT_SPEND_EVENT, onSpend)
    return () => window.removeEventListener(PROJECT_SPEND_EVENT, onSpend)
  }, [projectId, mutate])

  const total = Number(data?.totalUsd ?? 0)
  const generations = Number(data?.generations ?? 0)
  const label = data
    ? `${formatUSD(total)} estimated fal.ai spend on this project (${generations} generation${generations === 1 ? '' : 's'}). List prices — your actual bill may differ.`
    : 'Estimated fal.ai spend on this project'

  return (
    <div
      className="flex items-center gap-1.5 px-2 h-6 select-none"
      title={label}
    >
      <Receipt size={11} weight="thin" className="text-muted-foreground/70" />
      <span className="text-[10px] font-mono tracking-wider text-foreground/60">
        {isLoading && !data ? '…' : formatUSD(total)}
      </span>
    </div>
  )
}
