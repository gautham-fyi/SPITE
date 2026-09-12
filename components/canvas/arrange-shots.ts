import type { Edge, Node } from '@xyflow/react'

function shotNumber(node: Node): number | null {
  const data = node.data as Record<string, unknown>
  const sid = data.shotId || data.selectedShotId
  const match = String(sid || '').match(/(\d+)$/)
  if (!match) return null
  const n = parseInt(match[1], 10)
  return Number.isFinite(n) ? n : null
}

function nodeSize(node: Node) {
  const fallbackW = node.type === 'prompt' || node.type === 'comment' ? 340 : 420
  return {
    w: (node.measured?.width ?? node.width ?? fallbackW) as number,
    h: (node.measured?.height ?? node.height ?? 280) as number,
  }
}

/**
 * Line up the active scene by shot number: shot-1, shot-2, … left to right.
 * Prompt/comment nodes wired to a shot sit to its left; other tagged extras
 * stack under the primary still/video.
 */
export function arrangeShotsLayout(
  nodes: Node[],
  edges: Edge[],
  sceneId: string,
): Map<string, { x: number; y: number }> | null {
  const scene = nodes.filter(n => (n.data as Record<string, unknown>).sceneId === sceneId)
  const groups = new Map<number, Node[]>()
  for (const node of scene) {
    const num = shotNumber(node)
    if (num == null) continue
    const list = groups.get(num) ?? []
    list.push(node)
    groups.set(num, list)
  }
  if (groups.size === 0) return null

  const taggedIds = new Set([...groups.values()].flat().map(n => n.id))
  const neighbors = new Map<string, string[]>()
  for (const edge of edges) {
    if (!neighbors.has(edge.source)) neighbors.set(edge.source, [])
    if (!neighbors.has(edge.target)) neighbors.set(edge.target, [])
    neighbors.get(edge.source)!.push(edge.target)
    neighbors.get(edge.target)!.push(edge.source)
  }

  const sceneById = new Map(scene.map(n => [n.id, n]))
  const positions = new Map<string, { x: number; y: number }>()
  const claimed = new Set<string>()

  const START_X = 120
  const START_Y = 180
  const COL_GAP = 80
  const IN_GAP = 48
  const STACK_GAP = 32

  let cursorX = START_X
  for (const num of [...groups.keys()].sort((a, b) => a - b)) {
    const tagged = groups.get(num)!
    const primary =
      tagged.find(n => n.type === 'imageGen' || n.type === 'videoGen' || n.type === 'reference') ||
      tagged[0]

    const extras = new Map<string, Node>()
    const collect = (id: string) => {
      for (const nid of neighbors.get(id) || []) {
        if (taggedIds.has(nid) || claimed.has(nid) || extras.has(nid)) continue
        const sat = sceneById.get(nid)
        if (sat) extras.set(sat.id, sat)
      }
    }
    for (const node of tagged) {
      if (node.id !== primary.id) extras.set(node.id, node)
      collect(node.id)
    }

    const left = [...extras.values()].filter(n => n.type === 'prompt' || n.type === 'comment')
    const below = [...extras.values()].filter(n => n.type !== 'prompt' && n.type !== 'comment')

    const primarySize = nodeSize(primary)
    const leftW = left.length ? Math.max(...left.map(n => nodeSize(n).w)) : 0
    const leftH = left.reduce((sum, n, i) => sum + nodeSize(n).h + (i > 0 ? STACK_GAP : 0), 0)

    const shotX = cursorX + (left.length ? leftW + IN_GAP : 0)
    const shotY = START_Y
    positions.set(primary.id, { x: shotX, y: shotY })
    claimed.add(primary.id)

    let leftY = shotY + Math.max(0, (primarySize.h - leftH) / 2)
    for (const node of left) {
      positions.set(node.id, { x: cursorX, y: leftY })
      claimed.add(node.id)
      leftY += nodeSize(node).h + STACK_GAP
    }

    let belowY = shotY + primarySize.h + STACK_GAP
    for (const node of below) {
      positions.set(node.id, { x: shotX, y: belowY })
      claimed.add(node.id)
      belowY += nodeSize(node).h + STACK_GAP
    }

    cursorX = shotX + primarySize.w + COL_GAP
  }

  return positions
}
