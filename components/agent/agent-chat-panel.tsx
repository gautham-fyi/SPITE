'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate as mutateCache } from 'swr'
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type FileUIPart,
  type UIMessage,
} from 'ai'
import {
  ChatTeardropText,
  CircleNotch,
  File as FileIcon,
  List,
  Paperclip,
  PaperPlaneTilt,
  Plus,
  CaretDown,
  Robot,
  Square,
  Trash,
  X,
} from '@phosphor-icons/react'
import { useCanvasAgent, type AddNodeInput, type NodePatch } from './canvas-agent-context'
import { allowAgentGeneration, lastUserPlainText, summarizeTargets, type GenerationTarget } from '@/lib/agent/generation-gate'
import { AgentMarkdown } from './agent-markdown'
import {
  AGENT_MODELS,
  DEFAULT_AGENT_MODEL,
  agentModelLabel,
  resolveAgentModelId,
} from '@/lib/agent/model'
import {
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  attachmentMediaType,
  loadChatAttachment,
  type AttachmentPhase,
} from '@/lib/agent/load-attachment'

const MODEL_STORAGE_KEY = 'ztorymade:agent-model'

type Surface = 'canvas' | 'dashboard'
type ChatMode = 'agent' | 'ask'

type ThreadSummary = {
  id: string
  title: string
  projectId: string | null
  surface: string
  updatedAt: string
}

type ThreadDetail = ThreadSummary & {
  messages: UIMessage[]
  createdAt: string
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load')
  return res.json()
}

function cleanTitleSource(text: string) {
  let next = text.replace(/\s+/g, ' ').trim()
  next = next.replace(/^(please|hey|hi|hello|can you|could you|would you|use this to|use this|help me|i want to|i need to|i'd like to)\s+/i, '')
  next = next.replace(/^(make|create|write|build|draft|generate|plan)\s+(me\s+)?(a|an|the)?\s*/i, '')
  return next.trim()
}

function titleFromTurn(text: string, files: { filename?: string }[] = [], fallback = 'New chat') {
  const cleaned = cleanTitleSource(text)
  if (cleaned) {
    const titled = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    return titled.length > 36 ? `${titled.slice(0, 34)}…` : titled
  }
  const stem = files[0]?.filename?.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  if (stem) return stem.charAt(0).toUpperCase() + stem.slice(1)
  return fallback
}

function patchFromTool(input: Record<string, unknown>): NodePatch {
  return {
    prompt: typeof input.prompt === 'string' ? input.prompt : undefined,
    label: typeof input.label === 'string' ? input.label : undefined,
    modelId: typeof input.modelId === 'string' ? input.modelId : undefined,
    shotId: typeof input.shotId === 'string' ? input.shotId : undefined,
    text: typeof input.text === 'string' ? input.text : undefined,
    aspectRatio: typeof input.aspectRatio === 'string' ? input.aspectRatio : undefined,
    resolution: typeof input.resolution === 'string' ? input.resolution : undefined,
    numImages: typeof input.numImages === 'number' ? input.numImages : undefined,
    duration: typeof input.duration === 'string' ? input.duration : undefined,
  }
}

function visibleUserText(text: string) {
  return text.replace(/\n\nAttached file "[^"]+":\n\n[\s\S]*/g, '').trim()
}

function titleFromMessages(messages: UIMessage[], fallback = 'New chat') {
  const first = messages.find((m) => m.role === 'user')
  if (!first) return fallback
  const text = first.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
  const files = first.parts.filter((p): p is FileUIPart => p.type === 'file')
  return titleFromTurn(text, files, fallback)
}

type PendingAttachment = {
  id: string
  name: string
  mediaType: string
  previewUrl: string
  phase: AttachmentPhase
  error?: string
  uploaded?: FileUIPart
  textContent?: string
}

function relativeTime(dateStr: string) {
  const date = new Date(dateStr)
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

export function AgentChatPanel({
  surface,
  projectId,
  onClose,
}: {
  surface: Surface
  projectId?: string
  onClose?: () => void
}) {
  const { data: threads = [], mutate: mutateThreads } = useSWR<ThreadSummary[]>(
    '/api/agent/threads',
    fetcher,
  )
  const [threadId, setThreadId] = useState<string | null>(null)
  const [view, setView] = useState<'chat' | 'threads'>('chat')
  const [mode, setMode] = useState<ChatMode>('agent')
  const [modelId, setModelId] = useState(DEFAULT_AGENT_MODEL)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(MODEL_STORAGE_KEY)
      if (stored) setModelId(resolveAgentModelId(stored))
    } catch {
      /* ignore */
    }
  }, [])

  const handleModelChange = (id: string) => {
    const next = resolveAgentModelId(id)
    setModelId(next)
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (threadId) return
    if (threads.length) setThreadId(threads[0].id)
  }, [threads, threadId])

  const { data: active } = useSWR<ThreadDetail>(
    threadId ? `/api/agent/threads/${threadId}` : null,
    fetcher,
  )

  const createThread = async () => {
    const res = await fetch('/api/agent/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, surface }),
    })
    if (!res.ok) return
    const created = (await res.json()) as ThreadDetail
    await mutateThreads()
    await mutateCache(`/api/agent/threads/${created.id}`, created, { revalidate: false })
    setThreadId(created.id)
    setView('chat')
  }

  const deleteThread = async (id: string) => {
    await fetch(`/api/agent/threads/${id}`, { method: 'DELETE' })
    const next = threads.filter((t) => t.id !== id)
    await mutateThreads()
    if (threadId === id) setThreadId(next[0]?.id ?? null)
  }

  const currentTitle = threads.find((t) => t.id === threadId)?.title || active?.title || 'New chat'

  return (
    <aside className="agent-chrome h-full w-[420px] shrink-0 flex flex-col glass border-l border-border">
      <div className="flex items-center justify-between px-3 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Robot size={16} weight="thin" className="text-accent shrink-0" />
          <h3 className="text-[13px] font-medium text-foreground">
            {mode === 'ask' ? 'Ask' : 'Agent'}
          </h3>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => void createThread()}
            className="flex items-center justify-center w-8 h-8 rounded-md glass-hover text-muted-foreground hover:text-foreground"
            title="New chat"
          >
            <Plus size={16} weight="thin" />
          </button>
          <button
            onClick={() => setView((v) => (v === 'threads' ? 'chat' : 'threads'))}
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
              view === 'threads' ? 'bg-accent/20 text-accent' : 'glass-hover text-muted-foreground hover:text-foreground'
            }`}
            title="Chat threads"
          >
            <List size={16} weight="thin" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-md glass-hover text-muted-foreground hover:text-foreground"
              title="Close sidebar"
            >
              <X size={15} weight="thin" />
            </button>
          )}
        </div>
      </div>

      {view === 'threads' ? (
        <ThreadList
          threads={threads}
          activeId={threadId}
          onSelect={(id) => {
            setThreadId(id)
            setView('chat')
          }}
          onDelete={deleteThread}
          onNew={() => void createThread()}
        />
      ) : threadId && active && active.id === threadId ? (
        <AgentThreadChat
          key={threadId}
          threadId={threadId}
          title={currentTitle}
          initialMessages={Array.isArray(active.messages) ? active.messages : []}
          surface={surface}
          projectId={projectId}
          mode={mode}
          onModeChange={setMode}
          modelId={modelId}
          onModelChange={handleModelChange}
          onPersisted={() => void mutateThreads()}
          onTitleChange={() => void mutateThreads()}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <ChatTeardropText size={22} weight="thin" className="text-muted-foreground/40 mb-3" />
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            {threads.length === 0
              ? 'Start a thread to build scenes, tag shots, or generate stills.'
              : 'Loading thread…'}
          </p>
          {threads.length === 0 && (
            <button
              onClick={() => void createThread()}
              className="mt-4 text-[14px] tracking-wide text-accent hover:text-accent/80"
            >
              New chat
            </button>
          )}
        </div>
      )}
    </aside>
  )
}

function ThreadList({
  threads,
  activeId,
  onSelect,
  onDelete,
  onNew,
}: {
  threads: ThreadSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNew: () => void
}) {
  return (
    <div className="flex-1 overflow-y-auto px-2 py-2">
      <button
        onClick={onNew}
        className="w-full flex items-center gap-2 px-3 py-2.5 mb-2 rounded-lg border border-border text-[14px] text-foreground hover:bg-[var(--surface)]"
      >
        <Plus size={16} weight="thin" />
        New chat
      </button>
      {threads.length === 0 && (
        <p className="px-3 py-6 text-[14px] text-muted-foreground">
          No threads yet.
        </p>
      )}
      <div className="space-y-0.5">
        {threads.map((thread) => (
          <div
            key={thread.id}
            className={`group flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer ${
              thread.id === activeId ? 'bg-accent/15' : 'hover:bg-[var(--surface)]'
            }`}
            onClick={() => onSelect(thread.id)}
          >
            <ChatTeardropText size={16} weight="thin" className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-foreground truncate">{thread.title}</p>
              <p className="text-[12px] text-muted-foreground">
                {relativeTime(thread.updatedAt)}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                void onDelete(thread.id)
              }}
              className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-destructive"
              title="Delete thread"
            >
              <Trash size={11} weight="thin" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentThreadChat({
  threadId,
  title,
  initialMessages,
  surface,
  projectId,
  mode,
  onModeChange,
  modelId,
  onModelChange,
  onPersisted,
  onTitleChange,
}: {
  threadId: string
  title: string
  initialMessages: UIMessage[]
  surface: Surface
  projectId?: string
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
  modelId: string
  onModelChange: (id: string) => void
  onPersisted: () => void
  onTitleChange: () => void
}) {
  const router = useRouter()
  const canvas = useCanvasAgent()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)
  const titleRef = useRef(title)
  const modeRef = useRef(mode)
  const modelRef = useRef(modelId)
  const messagesRef = useRef<UIMessage[]>(initialMessages)
  const mutatedThisTurnRef = useRef(false)
  titleRef.current = title
  modeRef.current = mode
  modelRef.current = modelId

  useEffect(() => {
    setTitleDraft(title)
  }, [title])

  const saveTitle = (next: string) => {
    const cleaned = next.trim()
    if (!cleaned || cleaned === titleRef.current) return
    titleRef.current = cleaned
    setTitleDraft(cleaned)
    void fetch(`/api/agent/threads/${threadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: cleaned }),
    }).then(onTitleChange)
  }

  const queueFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list).filter((file) => file.size <= MAX_FILE_BYTES)
    if (!incoming.length) return
    const room = Math.max(0, MAX_ATTACHMENTS - attachments.length)
    const queued = incoming.slice(0, room).map((file) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      return {
        id,
        file,
        pending: {
          id,
          name: file.name,
          mediaType: attachmentMediaType(file),
          previewUrl: URL.createObjectURL(file),
          phase: 'reading' as const,
        } satisfies PendingAttachment,
      }
    })
    if (!queued.length) return
    setAttachments((prev) => [...prev, ...queued.map((item) => item.pending)])
    for (const { id, file } of queued) {
      void (async () => {
        try {
          const loaded = await loadChatAttachment(file, (phase) => {
            setAttachments((cur) => cur.map((a) => (a.id === id ? { ...a, phase } : a)))
          })
          setAttachments((cur) => cur.map((a) => (
            a.id === id
              ? { ...a, phase: 'ready', uploaded: loaded.uploaded, textContent: loaded.textContent }
              : a
          )))
        } catch (err) {
          setAttachments((cur) => cur.map((a) => (
            a.id === id
              ? { ...a, phase: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
              : a
          )))
        }
      })()
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id)
      if (found?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(found.previewUrl)
      return prev.filter((a) => a.id !== id)
    })
  }

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/agent/chat',
        body: () => ({ projectId, surface, mode: modeRef.current, model: modelRef.current }),
      }),
    [projectId, surface],
  )

  const gateGeneration = (nodeIds: string[]) => {
    const snap = canvas?.inspect()
    const targets: GenerationTarget[] = nodeIds.map((nodeId) => {
      const node = snap?.nodes.find((n) => n.id === nodeId)
      return {
        nodeId,
        type: node?.type,
        shotId: node?.shotId,
        label: node?.label,
        prompt: node?.prompt,
        modelId: node?.modelId,
        duration: node?.duration,
        numImages: node?.numImages,
        resolution: node?.resolution,
      }
    })
    return allowAgentGeneration({
      lastUserText: lastUserPlainText(messagesRef.current),
      mutatedThisTurn: mutatedThisTurnRef.current,
      targets,
    })
  }

  const { messages, sendMessage, addToolOutput, status, stop, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: (opts) =>
      modeRef.current === 'agent' && lastAssistantMessageIsCompleteWithToolCalls(opts),
    onToolCall: ({ toolCall }) => {
      const raw = toolCall as { toolName?: string; tool?: string; toolCallId: string; input?: unknown; args?: unknown }
      const name = raw.toolName || raw.tool || ''
      const input = (raw.input || raw.args || {}) as Record<string, unknown>
      const toolCallId = raw.toolCallId

      const fail = (errorText: string) => {
        void addToolOutput({ tool: name as never, toolCallId, state: 'output-error', errorText })
      }
      const ok = (output: unknown) => {
        void addToolOutput({ tool: name as never, toolCallId, output: output as never })
      }

      if (name === 'openProject') {
        const id = String(input.projectId || '')
        const origin = input.origin === 'flow' ? 'flow' : 'canvas'
        if (!id) return fail('projectId is required')
        router.push(origin === 'flow' ? `/m/project/${id}` : `/project/${id}`)
        return ok({ opened: id, origin })
      }

      if (!canvas) {
        if (name === 'inspectLiveCanvas') return ok({ error: 'Open a canvas project to inspect the live graph.' })
        return fail('This action needs an open canvas. Create or open a project first.')
      }

      try {
        switch (name) {
          case 'inspectLiveCanvas': {
            const snap = canvas.inspect()
            const pending = snap.nodes.filter((n) =>
              (n.type === 'imageGen' || n.type === 'videoGen') &&
              (!n.sceneId || n.sceneId === snap.activeSceneId),
            )
            const summary = summarizeTargets(pending)
            return ok({
              ...snap,
              generationPlan: {
                estimate: summary.estimateLabel,
                imageCount: summary.imageCount,
                videoCount: summary.videoCount,
                shots: summary.lines,
                note: summary.videoCount > 0
                  ? 'Video is very expensive. Recap prompts and wait for a new confirm before generate.'
                  : 'Recap prompts and wait for a new confirm before generate.',
              },
            })
          }
          case 'addScene':
            return ok(canvas.addScene(typeof input.name === 'string' ? input.name : undefined))
          case 'renameScene':
            return ok(canvas.renameScene(String(input.sceneId || ''), String(input.name || '')))
          case 'deleteScene':
            return ok(canvas.deleteScene(String(input.sceneId || '')))
          case 'switchScene':
            return ok(canvas.switchScene(String(input.sceneId || '')))
          case 'addNode':
            mutatedThisTurnRef.current = true
            return ok(canvas.addNode({
              ...(input as AddNodeInput),
              assetUrl: typeof input.assetUrl === 'string' ? input.assetUrl : undefined,
            }))
          case 'addNodes':
            mutatedThisTurnRef.current = true
            return ok(canvas.addNodes(Array.isArray(input.nodes) ? input.nodes as AddNodeInput[] : []))
          case 'updateNode':
            mutatedThisTurnRef.current = true
            return ok(canvas.updateNode(String(input.nodeId || ''), patchFromTool(input)))
          case 'updateNodes':
            mutatedThisTurnRef.current = true
            return ok(canvas.updateNodes(
              Array.isArray(input.nodes)
                ? (input.nodes as Array<Record<string, unknown>>).map((item) => ({
                    nodeId: String(item.nodeId || ''),
                    ...patchFromTool(item),
                  }))
                : [],
            ))
          case 'deleteNodes':
            return ok(canvas.deleteNodes(Array.isArray(input.nodeIds) ? input.nodeIds.map(String) : []))
          case 'connectNodes':
            mutatedThisTurnRef.current = true
            return ok(canvas.connectNodes(
              String(input.sourceId || ''),
              String(input.targetId || ''),
              typeof input.sourceHandle === 'string' ? input.sourceHandle : undefined,
              typeof input.targetHandle === 'string' ? input.targetHandle : undefined,
            ))
          case 'connectMany':
            mutatedThisTurnRef.current = true
            return ok(canvas.connectMany(
              Array.isArray(input.edges)
                ? (input.edges as Array<Record<string, unknown>>).map((edge) => ({
                    sourceId: String(edge.sourceId || ''),
                    targetId: String(edge.targetId || ''),
                    sourceHandle: typeof edge.sourceHandle === 'string' ? edge.sourceHandle : undefined,
                    targetHandle: typeof edge.targetHandle === 'string' ? edge.targetHandle : undefined,
                  }))
                : [],
            ))
          case 'generateNode': {
            const nodeId = String(input.nodeId || '')
            const gate = gateGeneration([nodeId])
            if (!gate.allowed) {
              return ok({ blocked: true, generated: false, error: gate.error, estimate: gate.summary.estimateLabel, shots: gate.summary.lines })
            }
            return ok({ ...canvas.generateNode(nodeId), estimate: gate.summary.estimateLabel })
          }
          case 'generateNodes': {
            const nodeIds = Array.isArray(input.nodeIds) ? input.nodeIds.map(String) : []
            const gate = gateGeneration(nodeIds)
            if (!gate.allowed) {
              return ok({ blocked: true, generated: false, error: gate.error, estimate: gate.summary.estimateLabel, shots: gate.summary.lines })
            }
            return ok({ ...canvas.generateNodes(nodeIds), estimate: gate.summary.estimateLabel })
          }
          case 'focusNode':
            return ok(canvas.focusNode(String(input.nodeId || '')))
          case 'renameProject':
            return ok(canvas.renameProject(String(input.name || '')))
          default:
            return
        }
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Tool failed')
      }
    },
  })
  messagesRef.current = messages

  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, status])

  useEffect(() => {
    if (messages.length === 0) return
    if (status !== 'ready' && status !== 'error') return
    const nextTitle = titleRef.current === 'New chat'
      ? titleFromMessages(messages, titleRef.current)
      : titleRef.current
    if (nextTitle !== titleRef.current) {
      titleRef.current = nextTitle
      setTitleDraft(nextTitle)
    }
    const handle = window.setTimeout(() => {
      void fetch(`/api/agent/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, title: nextTitle }),
      }).then(onPersisted)
    }, 300)
    return () => window.clearTimeout(handle)
  }, [messages, onPersisted, status, threadId])

  const busy = status === 'submitted' || status === 'streaming'
  const loadingFiles = attachments.some((a) => a.phase === 'reading' || a.phase === 'uploading')
  const readyFiles = attachments.filter((a) => a.uploaded && a.phase === 'ready').map((a) => a.uploaded!) as FileUIPart[]
  const lastUserHasFiles = messages.at(-1)?.role === 'user'
    && messages.at(-1)?.parts.some((part) => part.type === 'file')

  const onSubmit = () => {
    const text = input.trim()
    if (busy || loadingFiles) return
    if (!text && readyFiles.length === 0) return
    const docs = attachments.filter((a) => a.textContent)
    const docBlock = docs
      .map((a) => `Attached file "${a.name}":\n\n${a.textContent}`)
      .join('\n\n')
    const sendText = [text, docBlock].filter(Boolean).join('\n\n')
      || `Attached ${readyFiles.map((f) => f.filename).join(', ')}.`
    setInput('')
    attachments.forEach((a) => {
      if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
    })
    setAttachments([])
    if (titleRef.current === 'New chat') {
      const nextTitle = titleFromTurn(text || sendText, readyFiles)
      if (nextTitle !== 'New chat') saveTitle(nextTitle)
    }
    mutatedThisTurnRef.current = false
    void sendMessage({
      text: sendText,
      files: readyFiles,
    })
  }

  return (
    <>
      <div className="px-4 py-2 border-b border-border shrink-0">
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setEditingTitle(false)
              saveTitle(titleDraft)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                setEditingTitle(false)
                saveTitle(titleDraft)
              }
              if (e.key === 'Escape') {
                setTitleDraft(titleRef.current)
                setEditingTitle(false)
              }
            }}
            className="w-full bg-transparent text-[14px] text-foreground outline-none border-b border-accent/50"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            className="block w-full text-left text-[14px] text-foreground truncate hover:text-accent"
            title="Rename chat"
          >
            {titleDraft || title}
          </button>
        )}
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            {mode === 'ask'
              ? 'Write a script, shot list, treatment, or any text. This mode answers in prose — it will not touch the canvas. Switch to Agent to build scenes.'
              : surface === 'canvas'
                ? 'Ask it to build a scene, tag shots, drop generators, or run a generation. Example: “Make a 4-shot night-market scene and generate the stills.”'
                : 'Create or open a project, then it can build scenes on the canvas. Example: “New canvas project called Rain Pilot.”'}
          </p>
        )}

        {messages.map((message) => (
          <AgentMessage key={message.id} message={message} />
        ))}

        {busy && (
          <p className="text-[13px] text-muted-foreground flex items-center gap-1.5">
            <CircleNotch size={13} className="animate-spin" />
            {lastUserHasFiles && messages.at(-1)?.role === 'user' ? 'Reading attachments…' : 'Working…'}
          </p>
        )}
        {error && (
          <p className="text-[14px] text-destructive leading-relaxed">
            {error.message}
          </p>
        )}
      </div>

      <div
        className={`shrink-0 border-t p-3 ${dragOver ? 'border-accent/40 bg-accent/[0.04]' : 'border-border'}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files?.length) queueFiles(e.dataTransfer.files)
        }}
      >
        {attachments.length > 0 && (
          <div className="mb-2 space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((file) => (
                <div
                  key={file.id}
                  className="relative group w-14 h-14 rounded-md overflow-hidden border border-white/10 bg-black/40"
                  title={file.error || file.name}
                >
                  {file.mediaType.startsWith('image/') ? (
                    <img src={file.previewUrl} alt="" className="w-full h-full object-cover" />
                  ) : file.mediaType.startsWith('video/') ? (
                    <video src={file.previewUrl} className="w-full h-full object-cover" muted />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center px-1">
                      <FileIcon size={14} weight="thin" className="text-muted-foreground" />
                      <span className="text-[8px] font-mono text-muted-foreground/70 truncate w-full text-center">
                        {file.name.split('.').pop()}
                      </span>
                    </div>
                  )}
                  {(file.phase === 'reading' || file.phase === 'uploading') && (
                    <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                      <CircleNotch size={14} className="animate-spin text-white" />
                    </div>
                  )}
                  {file.phase === 'error' && <div className="absolute inset-0 bg-destructive/40" />}
                  <button
                    onClick={() => removeAttachment(file.id)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"
                    title="Remove"
                  >
                    <X size={8} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
            {loadingFiles && (
              <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                <CircleNotch size={12} className="animate-spin" />
                {attachments.some((a) => a.phase === 'reading') ? 'Reading files…' : 'Uploading files…'}
              </p>
            )}
            {attachments.some((a) => a.phase === 'error') && (
              <p className="text-[12px] text-destructive">
                {attachments.find((a) => a.error)?.error || 'A file failed to upload.'}
              </p>
            )}
          </div>
        )}
        <div className="flex items-center gap-1 mb-2 min-w-0">
          {(['agent', 'ask'] as const).map((value) => (
            <button
              key={value}
              onClick={() => onModeChange(value)}
              className={`px-2.5 py-1 rounded text-[13px] font-medium transition-colors ${
                mode === value
                  ? 'bg-accent/20 text-accent'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {value === 'agent' ? 'Agent' : 'Ask'}
            </button>
          ))}
          <span className="ml-1 hidden sm:inline text-[13px] text-muted-foreground">
            {mode === 'ask' ? 'text only' : 'can edit canvas'}
          </span>
          <div className="ml-auto min-w-0">
            <AgentModelPicker
              value={modelId}
              onChange={onModelChange}
              disabled={busy}
            />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.txt,.md,.markdown,.csv,.json"
            onChange={(e) => {
              if (e.target.files?.length) queueFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || attachments.length >= MAX_ATTACHMENTS}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--surface)] border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
            title="Attach files"
          >
            <Paperclip size={14} weight="thin" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files)
              if (files.length) {
                e.preventDefault()
                queueFiles(files)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSubmit()
              }
            }}
            rows={2}
            placeholder={
              mode === 'ask'
                ? 'Write a scene, script, or question…'
                : surface === 'canvas' ? 'Build a scene…' : 'Create a project…'
            }
            className="flex-1 resize-none bg-[var(--surface)] border border-border rounded-lg px-3 py-2.5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground outline-none focus:border-accent/40"
          />
          {busy ? (
            <button
              onClick={() => stop()}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 text-muted-foreground hover:text-foreground"
              title="Stop"
            >
              <Square size={12} weight="fill" />
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={loadingFiles || (!input.trim() && readyFiles.length === 0)}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/20 text-accent disabled:opacity-30"
              title="Send"
            >
              <PaperPlaneTilt size={14} weight="fill" />
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function toolState(part: UIMessage['parts'][number]) {
  return 'state' in part ? String(part.state) : ''
}

function isFailedTool(part: UIMessage['parts'][number]) {
  const state = toolState(part)
  return state === 'output-error' || state === 'output-denied'
}

function AgentMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'
  const texts = message.parts.filter((p) => p.type === 'text' && p.text.trim())
  const files = message.parts.filter((p): p is FileUIPart => p.type === 'file')
  const tools = message.parts.filter((p) => p.type.startsWith('tool-'))
  const failedTools = tools.filter(isFailedTool)
  const visibleUserBits = texts
    .map((part) => (part.type === 'text' ? visibleUserText(part.text) : ''))
    .filter(Boolean)
  const hasAssistantText = !isUser && texts.length > 0
  const hasUserText = isUser && visibleUserBits.length > 0
  const showFailures = failedTools.length > 0

  if (!files.length && !hasAssistantText && !hasUserText && !showFailures) {
    return null
  }

  return (
    <div className={isUser ? 'pl-6' : 'pr-2'}>
      <div
        className={`rounded-lg px-3.5 py-2.5 text-[15px] leading-relaxed ${
          isUser
            ? 'bg-accent/15 text-foreground whitespace-pre-wrap'
            : 'bg-[var(--surface)] text-foreground'
        }`}
      >
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {files.map((file, i) => (
              <div key={`${file.url}-${i}`} className="w-24 rounded-md overflow-hidden border border-white/10 bg-black/40">
                {file.mediaType.startsWith('image/') ? (
                  <img src={file.url} alt={file.filename || ''} className="w-full h-20 object-cover" />
                ) : file.mediaType.startsWith('video/') ? (
                  <video src={file.url} className="w-full h-20 object-cover" muted controls />
                ) : (
                  <div className="h-20 flex flex-col items-center justify-center gap-1 px-2">
                    <FileIcon size={16} weight="thin" className="text-muted-foreground" />
                    <span className="text-[12px] text-muted-foreground truncate w-full text-center">
                      {file.filename || 'file'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {isUser
          ? visibleUserBits.map((text, i) => <span key={i}>{text}</span>)
          : texts.map((part, i) => (
              part.type === 'text' ? <AgentMarkdown key={i} text={part.text} /> : null
            ))}
        {showFailures && (
          <p className={`${hasAssistantText || files.length ? 'mt-2' : ''} text-[13px] text-destructive`}>
            {failedTools.length === 1 ? 'One action failed.' : `${failedTools.length} actions failed.`}
          </p>
        )}
      </div>
    </div>
  )
}

function AgentModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Chat model"
        className="flex items-center gap-1 max-w-[168px] px-2 py-1 rounded-full bg-[var(--surface)] border border-border text-[13px] text-foreground hover:border-accent/40 disabled:opacity-40"
      >
        <span className="truncate">{agentModelLabel(value)}</span>
        <CaretDown size={12} weight="bold" className="shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 z-50 w-56 rounded-xl border border-border bg-popover py-1 shadow-xl">
          {AGENT_MODELS.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => {
                onChange(model.id)
                setOpen(false)
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] ${
                model.id === value ? 'bg-accent/15 text-foreground' : 'text-foreground hover:bg-[var(--surface)]'
              }`}
            >
              <span className="truncate">{model.label}</span>
              <span className="shrink-0 text-[12px] text-muted-foreground">{model.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
