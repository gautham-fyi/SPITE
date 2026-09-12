import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai'
import { hydrateFileParts } from '@/lib/agent/hydrate-files'
import { AGENT_MAX_RETRIES, AGENT_MAX_STEPS, prepareAgentStep } from '@/lib/agent/loop'
import { getAgentModel, isAgentConfigured } from '@/lib/agent/model'
import { AGENT_SYSTEM_PROMPT, ASK_SYSTEM_PROMPT } from '@/lib/agent/system-prompt'
import { clientToolDefs, createServerTools } from '@/lib/agent/tools'

export const maxDuration = 300

export async function POST(request: Request) {
  if (!isAgentConfigured()) {
    return Response.json(
      { error: 'Agent needs FAL_KEY (or AGENT_API_KEY) to talk to a model.' },
      { status: 503 },
    )
  }

  try {
    const body = await request.json()
    const messages = (body.messages ?? []) as UIMessage[]
    const projectId = typeof body.projectId === 'string' ? body.projectId : undefined
    const surface = body.surface === 'dashboard' ? 'dashboard' : 'canvas'
    const mode = body.mode === 'ask' ? 'ask' : 'agent'

    const hydrated = await hydrateFileParts(messages)
    let modelMessages
    try {
      modelMessages = await convertToModelMessages(hydrated)
    } catch (err) {
      console.error('[agent/chat] convert messages failed, keeping inlined file text', err)
      const safe = hydrated.map((message) => ({
        ...message,
        parts: message.parts.map((part) =>
          part.type === 'file'
            ? {
                type: 'text' as const,
                text: '[Attached file: ' + (part.filename || 'file') + ']',
              }
            : part,
        ),
      }))
      modelMessages = await convertToModelMessages(safe)
    }

    const result = streamText({
      model: getAgentModel(body.model),
      instructions: mode === 'ask'
        ? ASK_SYSTEM_PROMPT
        : [
            AGENT_SYSTEM_PROMPT,
            'Current surface: ' + surface + '.',
            projectId ? 'Open project id: ' + projectId + '.' : 'No project is open.',
          ].join('\n'),
      messages: modelMessages,
      ...(mode === 'ask'
        ? {}
        : {
            tools: {
              ...createServerTools(projectId),
              ...clientToolDefs,
            },
            stopWhen: isStepCount(AGENT_MAX_STEPS),
            maxRetries: AGENT_MAX_RETRIES,
            prepareStep: prepareAgentStep(),
          }),
    })

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    })
  } catch (error) {
    console.error('[agent/chat] failed:', error)
    const message = error instanceof Error ? error.message : 'Chat failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
