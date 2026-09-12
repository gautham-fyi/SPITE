import { useCallback, useRef, useEffect, useState, useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'

type PersistedScene = { id: string; name: string }

export type CanvasSaveStatus = 'saved' | 'unsaved' | 'saving'

type Snapshot = {
  nodes: Node[]
  edges: Edge[]
  scenes: PersistedScene[]
  activeSceneId: string
}

function serializeSnapshot(snapshot: Snapshot) {
  return JSON.stringify({
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    scenes: snapshot.scenes.map((s) => ({ id: s.id, name: s.name })),
    activeSceneId: snapshot.activeSceneId,
  })
}

export function useCanvasAutoSave(
  projectId: string | undefined,
  nodes: Node[],
  edges: Edge[],
  scenes: PersistedScene[],
  activeSceneId: string,
) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')
  const isSavingRef = useRef(false)
  const pendingSaveRef = useRef(false)
  const hydratedRef = useRef(false)
  const skipDirtyRef = useRef(false)
  const [saveStatus, setSaveStatus] = useState<CanvasSaveStatus>('saved')

  const persistedScenes: PersistedScene[] = useMemo(
    () => scenes.map((s) => ({ id: s.id, name: s.name })),
    [scenes],
  )

  const snapshot = useMemo<Snapshot>(
    () => ({ nodes, edges, scenes: persistedScenes, activeSceneId }),
    [nodes, edges, persistedScenes, activeSceneId],
  )

  const saveCanvasRef = useRef<(force?: boolean) => Promise<void>>(async () => {})

  const saveCanvas = useCallback(async (force = false) => {
    if (!projectId) return
    if (isSavingRef.current) {
      pendingSaveRef.current = true
      return
    }

    const currentState = serializeSnapshot(snapshot)
    if (currentState === lastSavedRef.current) {
      if (force) setSaveStatus('saved')
      return
    }

    if (nodes.length === 0 && lastSavedRef.current) {
      try {
        const last = JSON.parse(lastSavedRef.current)
        if (Array.isArray(last.nodes) && last.nodes.length > 0) {
          console.warn('[Canvas] Skipping empty-nodes autosave; previous save had content')
          return
        }
      } catch {
        /* let the server guard handle a bad last-save snapshot */
      }
    }

    isSavingRef.current = true
    setSaveStatus('saving')

    try {
      const response = await fetch(`/api/projects/${projectId}/canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes,
          edges,
          scenes: persistedScenes,
          activeSceneId,
        }),
      })

      if (response.ok) {
        lastSavedRef.current = currentState
        setSaveStatus(pendingSaveRef.current ? 'unsaved' : 'saved')
      } else {
        console.error('[Canvas] Failed to save')
        setSaveStatus('unsaved')
      }
    } catch (error) {
      console.error('[Canvas] Error saving:', error)
      setSaveStatus('unsaved')
    } finally {
      isSavingRef.current = false
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false
        void saveCanvasRef.current?.(force)
      }
    }
  }, [projectId, snapshot, nodes, edges, persistedScenes, activeSceneId])

  useEffect(() => {
    saveCanvasRef.current = saveCanvas
  }, [saveCanvas])

  const markSynced = useCallback((loaded?: Snapshot) => {
    lastSavedRef.current = serializeSnapshot(loaded ?? snapshot)
    hydratedRef.current = true
    skipDirtyRef.current = true
    setSaveStatus('saved')
  }, [snapshot])

  useEffect(() => {
    if (!projectId || !hydratedRef.current) return
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false
      lastSavedRef.current = serializeSnapshot(snapshot)
      setSaveStatus('saved')
      return
    }
    setSaveStatus((prev) => (prev === 'saving' ? prev : 'unsaved'))
  }, [projectId, snapshot])

  useEffect(() => {
    if (!projectId || !hydratedRef.current) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      void saveCanvasRef.current?.()
    }, 1200)

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [projectId, snapshot])

  useEffect(() => {
    if (!projectId) return
    const interval = setInterval(() => saveCanvasRef.current?.(), 20000)
    return () => clearInterval(interval)
  }, [projectId])

  useEffect(() => {
    const flush = () => {
      if (!projectId || nodes.length === 0) return
      if (serializeSnapshot(snapshot) === lastSavedRef.current) return
      const body = new Blob(
        [JSON.stringify({ nodes, edges, scenes: persistedScenes, activeSceneId })],
        { type: 'application/json' },
      )
      navigator.sendBeacon?.(`/api/projects/${projectId}/canvas`, body)
    }

    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [projectId, nodes, edges, persistedScenes, activeSceneId, snapshot])

  return { saveCanvas, saveStatus, markSynced }
}
