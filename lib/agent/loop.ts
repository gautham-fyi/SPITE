import { AGENT_MAX_STEPS } from '@/lib/agent/limits'

export { AGENT_MAX_STEPS, AGENT_MAX_RETRIES, AGENT_BATCH_LIMIT } from '@/lib/agent/limits'

export function prepareAgentStep(maxSteps = AGENT_MAX_STEPS) {
  return ({
    stepNumber,
    initialInstructions,
  }: {
    stepNumber: number
    initialInstructions?: unknown
  }) => {
    const remaining = Math.max(0, maxSteps - stepNumber)
    const base = typeof initialInstructions === 'string'
      ? initialInstructions
      : Array.isArray(initialInstructions)
        ? initialInstructions.filter((part) => typeof part === 'string').join('\n')
        : ''

    const nudge = remaining <= 8
      ? 'Few steps left. Finish the highest-value remaining work, then say what is still unfinished.'
      : 'Keep going until the user request is fully done. Prefer addNodes, updateNodes, and generateNodes for batches. Do not stop mid-sequence.'

    return {
      instructions: [
        base,
        '',
        'Tool loop: step ' + (stepNumber + 1) + ' of ' + maxSteps + ' (' + remaining + ' remaining).',
        nudge,
      ].join('\n'),
    }
  }
}
