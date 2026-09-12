'use client'

import { createContext, useContext } from 'react'

export type AgentNodeType = 'prompt' | 'imageGen' | 'videoGen' | 'reference' | 'comment' | 'sticker' | 'compress'

export type LiveCanvasSnapshot = {
  projectName: string
  activeSceneId: string
  scenes: { id: string; name: string }[]
  nodes: {
    id: string
    type: string
    sceneId?: string
    shotId?: string
    label?: string
    prompt?: string
    modelId?: string
    aspectRatio?: string
    resolution?: string
    numImages?: number
    duration?: string
    status?: string
    outputUrl?: string
    x: number
    y: number
  }[]
}

export type AddNodeInput = {
  type: AgentNodeType
  prompt?: string
  label?: string
  modelId?: string
  shotId?: string
  sceneId?: string
  assetUrl?: string
  aspectRatio?: string
  resolution?: string
  numImages?: number
  duration?: string
  x?: number
  y?: number
}

export type NodePatch = {
  prompt?: string
  label?: string
  modelId?: string
  shotId?: string
  text?: string
  aspectRatio?: string
  resolution?: string
  numImages?: number
  duration?: string
}

export type CanvasAgentApi = {
  projectId: string
  inspect: () => LiveCanvasSnapshot
  addScene: (name?: string) => { id: string; name: string }
  renameScene: (sceneId: string, name: string) => { ok: boolean; error?: string }
  deleteScene: (sceneId: string) => { ok: boolean; error?: string }
  switchScene: (sceneId: string) => { ok: boolean; error?: string }
  addNode: (input: AddNodeInput) => { id: string }
  addNodes: (inputs: AddNodeInput[]) => { nodes: { id: string; type: string; shotId?: string; label?: string }[] }
  updateNode: (nodeId: string, patch: NodePatch) => { ok: boolean; error?: string }
  updateNodes: (patches: Array<NodePatch & { nodeId: string }>) => { updated: string[]; failed: { nodeId: string; error: string }[] }
  deleteNodes: (nodeIds: string[]) => { ok: boolean; removed: number }
  connectNodes: (sourceId: string, targetId: string, sourceHandle?: string, targetHandle?: string) => { ok: boolean; error?: string }
  connectMany: (edges: Array<{ sourceId: string; targetId: string; sourceHandle?: string; targetHandle?: string }>) => { connected: number; failed: { sourceId: string; targetId: string; error: string }[] }
  generateNode: (nodeId: string) => { ok: boolean; error?: string }
  generateNodes: (nodeIds: string[]) => { started: string[]; failed: { nodeId: string; error: string }[] }
  focusNode: (nodeId: string) => { ok: boolean; error?: string }
  renameProject: (name: string) => { ok: boolean }
}

const CanvasAgentContext = createContext<CanvasAgentApi | null>(null)

export function CanvasAgentProvider({
  value,
  children,
}: {
  value: CanvasAgentApi
  children: React.ReactNode
}) {
  return <CanvasAgentContext.Provider value={value}>{children}</CanvasAgentContext.Provider>
}

export function useCanvasAgent() {
  return useContext(CanvasAgentContext)
}

export function normalizeShotId(raw?: string): string | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^(?:shot[-_\s]*)?(\d+)$/i)
  if (match) return `shot-${Number(match[1])}`
  return trimmed
}

export function defaultHandles(sourceType?: string, targetType?: string) {
  if (sourceType === 'prompt' && (targetType === 'imageGen' || targetType === 'videoGen' || targetType === 'prompt')) {
    return { sourceHandle: 'prompt-out', targetHandle: 'prompt-in' }
  }
  if (sourceType === 'videoGen' && targetType === 'videoGen') {
    return { sourceHandle: 'video-out', targetHandle: 'video-in' }
  }
  if ((sourceType === 'imageGen' || sourceType === 'reference') && (targetType === 'imageGen' || targetType === 'videoGen' || targetType === 'reference')) {
    return { sourceHandle: 'image-out', targetHandle: 'image-in' }
  }
  if (sourceType === 'reference' && targetType === 'videoGen') {
    return { sourceHandle: 'audio-out', targetHandle: 'audio-in' }
  }
  return { sourceHandle: 'prompt-out', targetHandle: 'prompt-in' }
}
