import { createOpenAI } from '@ai-sdk/openai'

const FAL_OPENAI_BASE = 'https://fal.run/openrouter/router/openai/v1'
export const DEFAULT_AGENT_MODEL = 'google/gemini-3.8-flash'

export const AGENT_MODELS = [
  { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash', hint: 'Fast' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', hint: 'Strong' },
  { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', hint: 'Cheap' },
  { id: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol', hint: 'OpenAI' },
  { id: 'openai/gpt-6-astra', label: 'GPT-6 Astra', hint: 'Newest' },
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', hint: 'Anthropic' },
  { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5', hint: 'Best' },
  { id: 'anthropic/claude-fable-5.1', label: 'Claude Fable 5.1', hint: 'Writing' },
  { id: 'x-ai/grok-4.6', label: 'Grok 4.6', hint: 'xAI' },
  { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1', hint: 'Cheap' },
] as const

export type AgentModelId = (typeof AGENT_MODELS)[number]['id']

const ALLOWED = new Set<string>(AGENT_MODELS.map((m) => m.id))

export function resolveAgentModelId(raw?: unknown) {
  if (typeof raw === 'string' && ALLOWED.has(raw)) return raw
  const env = typeof process !== 'undefined' ? process.env.AGENT_MODEL?.trim() : ''
  if (env && ALLOWED.has(env)) return env
  return DEFAULT_AGENT_MODEL
}

export function agentModelLabel(id: string) {
  return AGENT_MODELS.find((m) => m.id === id)?.label ?? id
}

export function isAgentConfigured() {
  return Boolean(process.env.FAL_KEY?.trim() || process.env.AGENT_API_KEY?.trim())
}

export function getAgentModel(requested?: unknown) {
  const agentKey = process.env.AGENT_API_KEY?.trim()
  const falKey = process.env.FAL_KEY?.trim()
  const modelId = resolveAgentModelId(requested)

  if (agentKey) {
    const openai = createOpenAI({
      apiKey: agentKey,
      baseURL: process.env.AGENT_BASE_URL?.trim() || undefined,
    })
    return openai.chat(modelId)
  }

  if (!falKey) {
    throw new Error('Set FAL_KEY (or AGENT_API_KEY) to use the agent.')
  }

  const openai = createOpenAI({
    name: 'fal-openrouter',
    baseURL: FAL_OPENAI_BASE,
    apiKey: 'not-needed',
    headers: { Authorization: `Key ${falKey}` },
  })
  return openai.chat(modelId)
}
