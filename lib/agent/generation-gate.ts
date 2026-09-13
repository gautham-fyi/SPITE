import { estimateGenerationCost, formatUSD } from '@/lib/fal-cost'
import { getModelById } from '@/lib/fal-models'

export type GenerationTarget = {
  nodeId: string
  type?: string
  shotId?: string
  label?: string
  prompt?: string
  modelId?: string
  duration?: string
  numImages?: number
  resolution?: string
}

const SHORT_YES =
  /^(yes|yep|yeah|y|ok|okay|sure|go|doit|do it|approved|approve|lgtm|looks good|ship it)[.!\s]*$/i

const APPROVAL =
  /\b(generate|go ahead|approved|approve( it| them)?|do it|run (them|it|those)|fire|make them|render|animate them|animate it)\b/i

const VIDEO_OK =
  /\b(video|videos|clips?|animate|all of them|all shots|every shot|the lot)\b/i

export function lastUserPlainText(
  messages: Array<{ role?: string; parts?: Array<{ type?: string; text?: string }> }>,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'user') continue
    return (message.parts || [])
      .filter((part) => part.type === 'text' && part.text)
      .map((part) => part.text || '')
      .join('\n')
      .trim()
  }
  return ''
}

export function isGenerateApproval(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (SHORT_YES.test(t)) return true
  return APPROVAL.test(t)
}

export function summarizeTargets(targets: GenerationTarget[]) {
  const videos = targets.filter((t) => t.type === 'videoGen')
  const images = targets.filter((t) => t.type === 'imageGen')
  let estimatedUsd = 0
  let known = true
  const lines = targets.map((t) => {
    const model = getModelById(t.modelId || '')
    const durationSeconds = t.duration ? Number.parseInt(t.duration, 10) || undefined : undefined
    const cost = estimateGenerationCost(model, {
      count: Math.max(1, t.numImages || 1),
      durationSeconds,
      resolution: t.resolution,
    })
    if (!cost.isKnown) known = false
    else estimatedUsd += cost.total
    const shot = t.shotId || t.label || t.nodeId
    const prompt = (t.prompt || '').trim().replace(/\s+/g, ' ')
    const preview = prompt.length > 140 ? `${prompt.slice(0, 137)}…` : prompt
    return `${shot} · ${t.type === 'videoGen' ? 'video' : 'image'} · ${model?.name || t.modelId || 'unknown'}${preview ? ` — ${preview}` : ''}`
  })
  return {
    videoCount: videos.length,
    imageCount: images.length,
    estimatedUsd,
    estimateLabel: known ? formatUSD(estimatedUsd) : 'unknown',
    lines,
  }
}

export function allowAgentGeneration(opts: {
  lastUserText: string
  mutatedThisTurn: boolean
  targets: GenerationTarget[]
}): { allowed: true; summary: ReturnType<typeof summarizeTargets> } | {
  allowed: false
  error: string
  summary: ReturnType<typeof summarizeTargets>
} {
  const summary = summarizeTargets(opts.targets)
  const text = opts.lastUserText

  if (opts.mutatedThisTurn) {
    return {
      allowed: false,
      summary,
      error: [
        'Blocked: prompts or nodes were just written this turn. Do not generate yet.',
        `Planned spend about ${summary.estimateLabel} (${summary.imageCount} image, ${summary.videoCount} video).`,
        'List every shot prompt for the user, then stop and wait. They must send a new message like "looks good, generate" before you may call generate again.',
        summary.videoCount > 0
          ? 'Video is expensive. Call out the video shots and the estimate explicitly.'
          : '',
      ].filter(Boolean).join(' '),
    }
  }

  if (!isGenerateApproval(text)) {
    return {
      allowed: false,
      summary,
      error: [
        'Blocked: the user has not verified these prompts yet.',
        `Show the shot list and the ~${summary.estimateLabel} estimate, then ask them to reply generate / approved / looks good.`,
        summary.videoCount > 0
          ? `Video is very expensive (${summary.videoCount} clip${summary.videoCount === 1 ? '' : 's'}). Do not generate until they confirm.`
          : '',
      ].filter(Boolean).join(' '),
    }
  }

  if (summary.videoCount > 0 && !SHORT_YES.test(text.trim()) && !VIDEO_OK.test(text) && !/\bgenerate\b/i.test(text)) {
    return {
      allowed: false,
      summary,
      error: [
        `Blocked: ${summary.videoCount} video generation${summary.videoCount === 1 ? '' : 's'} (~${summary.estimateLabel}).`,
        'Ask the user to confirm the video spend in a new message (e.g. "generate the videos" or "approved").',
      ].join(' '),
    }
  }

  return { allowed: true, summary }
}
