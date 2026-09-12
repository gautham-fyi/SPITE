import { tool } from 'ai'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { FAL_MODELS } from '@/lib/fal-models'
import { AGENT_BATCH_LIMIT } from '@/lib/agent/limits'

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

const nodeTypeSchema = z.enum(['prompt', 'imageGen', 'videoGen', 'reference', 'comment', 'sticker', 'compress'])

const addNodeFields = {
  type: nodeTypeSchema,
  prompt: z.string().optional(),
  label: z.string().optional(),
  modelId: z.string().optional(),
  shotId: z.string().optional().describe('e.g. shot-1 or Shot 54'),
  sceneId: z.string().optional(),
  assetUrl: z.string().optional().describe('Persistent /api/r2-image/ URL from a chat attachment'),
  aspectRatio: z.string().optional().describe('e.g. 1:1, 16:9, 9:16'),
  resolution: z.string().optional().describe('e.g. 1K, 2K, 4K'),
  numImages: z.number().int().min(1).max(12).optional().describe('Batch count on image generators'),
  duration: z.string().optional().describe('Video duration, e.g. 5s'),
  x: z.number().optional(),
  y: z.number().optional(),
}

const nodePatchFields = {
  prompt: z.string().optional(),
  label: z.string().optional(),
  modelId: z.string().optional().describe('Model id or display name, e.g. nano-banana-2'),
  shotId: z.string().optional().describe('e.g. shot-54 or Shot 54. Empty string unassigns.'),
  text: z.string().optional(),
  aspectRatio: z.string().optional().describe('e.g. 1:1, 16:9, 9:16'),
  resolution: z.string().optional().describe('e.g. 1K, 2K, 4K'),
  numImages: z.number().int().min(1).max(12).optional(),
  duration: z.string().optional(),
}

export function createServerTools(projectId?: string) {
  return {
    listProjects: tool({
      description: 'List all ZtoryMade projects (canvas and Flow).',
      inputSchema: z.object({}),
      execute: async () => {
        const sql = getDb()
        const rows = await sql`
          SELECT id, name, origin, updatedat
          FROM projects
          ORDER BY updatedat DESC
        `
        return { projects: rows }
      },
    }),

    createProject: tool({
      description: 'Create a new project. Use origin "canvas" for the node graph, "flow" for the linear thread.',
      inputSchema: z.object({
        name: z.string().min(1).describe('Project name'),
        origin: z.enum(['canvas', 'flow']).optional().describe('Defaults to canvas'),
      }),
      execute: async ({ name, origin }) => {
        const sql = getDb()
        const projectId = uuidv4()
        const safeOrigin = origin === 'flow' ? 'flow' : 'canvas'
        const rows = await sql`
          INSERT INTO projects (id, userid, name, description, origin, createdat, updatedat)
          VALUES (${projectId}, ${DEFAULT_USER_ID}, ${name}, ${''}, ${safeOrigin}, NOW(), NOW())
          RETURNING id, name, origin, createdat
        `
        return rows[0]
      },
    }),

    listModels: tool({
      description: 'List available fal.ai image and video models the canvas can run.',
      inputSchema: z.object({
        category: z.enum(['image', 'video', 'all']).optional(),
      }),
      execute: async ({ category }) => {
        const models = FAL_MODELS
          .filter((m) => {
            if (m.legacy) return false
            if (!category || category === 'all') return m.category === 'image' || m.category === 'video'
            return m.category === category
          })
          .map((m) => ({
            id: m.id,
            name: m.name,
            category: m.category,
            defaultAspect: m.defaultAspectRatio,
            defaultResolution: m.defaultResolution,
            aspectRatios: m.aspectRatios,
            resolutions: m.resolutions,
          }))
        return { models }
      },
    }),

    listFolders: tool({
      description: 'List character/prop/location folders in the current project.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!projectId) return { error: 'No project is open. Open a canvas project first.' }
        const sql = getDb()
        const rows = await sql`
          SELECT id, type, name, description
          FROM asset_folders
          WHERE project_id = ${projectId}
          ORDER BY type, name
        `
        return { folders: rows }
      },
    }),

    createFolder: tool({
      description: 'Create a Character, Prop, Location, or General folder for @mentions.',
      inputSchema: z.object({
        name: z.string().min(1),
        type: z.enum(['character', 'prop', 'location', 'general']),
        description: z.string().optional(),
      }),
      execute: async ({ name, type, description }) => {
        if (!projectId) return { error: 'No project is open. Open a canvas project first.' }
        const sql = getDb()
        const id = uuidv4()
        await sql`
          INSERT INTO asset_folders (id, project_id, type, name, description)
          VALUES (${id}, ${projectId}, ${type}, ${name}, ${description || null})
        `
        return { id, type, name }
      },
    }),

    listAssets: tool({
      description: 'List generated and uploaded assets in the current project.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ limit }) => {
        if (!projectId) return { error: 'No project is open. Open a canvas project first.' }
        const sql = getDb()
        const cap = limit ?? 20
        const rows = await sql`
          SELECT id, type, model, prompt, r2_url, used_in_canvas, created_at
          FROM generation_history
          WHERE project_id = ${projectId}
          ORDER BY created_at DESC
          LIMIT ${cap}
        `
        return { assets: rows }
      },
    }),

    getSavedCanvas: tool({
      description: 'Read the last saved canvas from the database (may be a few seconds behind the live graph). Prefer inspectLiveCanvas when on the canvas.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!projectId) return { error: 'No project is open.' }
        const sql = getDb()
        const [project] = await sql`
          SELECT name, scenes, active_scene_id FROM projects WHERE id = ${projectId}
        `
        const nodes = await sql`
          SELECT nodeid, type, position_x, position_y, data
          FROM canvas_nodes WHERE projectid = ${projectId}
        `
        return {
          name: project?.name,
          scenes: project?.scenes,
          activeSceneId: project?.active_scene_id,
          nodes: nodes.map((n) => {
            const data = (n.data ?? {}) as Record<string, unknown>
            return {
              id: n.nodeid,
              type: n.type,
              position: { x: n.position_x, y: n.position_y },
              sceneId: data.sceneId,
              shotId: data.shotId,
              label: data.label,
              prompt: data.prompt || data.text,
              modelId: data.modelId,
              aspectRatio: data.aspectRatio,
              resolution: data.resolution,
              numImages: data.numImages,
              duration: data.duration,
              status: data.status,
              outputUrl: data.outputUrl,
            }
          }),
        }
      },
    }),
  }
}

export const clientToolDefs = {
  inspectLiveCanvas: tool({
    description: 'Inspect the live canvas: scenes, active scene, and nodes. Call this before mutating a canvas you did not just create.',
    inputSchema: z.object({}),
  }),
  addScene: tool({
    description: 'Create a new scene tab and switch to it.',
    inputSchema: z.object({
      name: z.string().optional().describe('Defaults to the next Scene N'),
    }),
  }),
  renameScene: tool({
    description: 'Rename a scene tab.',
    inputSchema: z.object({
      sceneId: z.string(),
      name: z.string().min(1),
    }),
  }),
  deleteScene: tool({
    description: 'Delete a scene and every node tagged to it.',
    inputSchema: z.object({
      sceneId: z.string(),
    }),
  }),
  switchScene: tool({
    description: 'Switch the visible scene tab.',
    inputSchema: z.object({
      sceneId: z.string(),
    }),
  }),
  addNode: tool({
    description: 'Add one node to the active scene. For many shots, use addNodes instead.',
    inputSchema: z.object(addNodeFields),
  }),
  addNodes: tool({
    description: 'Add many nodes in one step. Use this for storyboards, sequences, and any request with more than two shots.',
    inputSchema: z.object({
      nodes: z.array(z.object(addNodeFields)).min(1).max(AGENT_BATCH_LIMIT),
    }),
  }),
  updateNode: tool({
    description: 'Edit one generator or prompt node. For many nodes, use updateNodes.',
    inputSchema: z.object({
      nodeId: z.string(),
      ...nodePatchFields,
    }),
  }),
  updateNodes: tool({
    description: 'Edit many nodes in one step: prompts, models, aspect, resolution, shot tags.',
    inputSchema: z.object({
      nodes: z.array(z.object({
        nodeId: z.string(),
        ...nodePatchFields,
      })).min(1).max(AGENT_BATCH_LIMIT),
    }),
  }),
  deleteNodes: tool({
    description: 'Delete one or more nodes and their edges.',
    inputSchema: z.object({
      nodeIds: z.array(z.string()).min(1),
    }),
  }),
  connectNodes: tool({
    description: 'Connect two nodes. Defaults to the usual handle pair (prompt→generator, image→video).',
    inputSchema: z.object({
      sourceId: z.string(),
      targetId: z.string(),
      sourceHandle: z.string().optional(),
      targetHandle: z.string().optional(),
    }),
  }),
  generateNode: tool({
    description: 'Run Generate on an image or video node. Spends the user fal.ai credit.',
    inputSchema: z.object({
      nodeId: z.string(),
    }),
  }),
  generateNodes: tool({
    description: 'Run Generate on several image or video nodes. Spends fal.ai credit for each.',
    inputSchema: z.object({
      nodeIds: z.array(z.string()).min(1).max(20),
    }),
  }),
  connectMany: tool({
    description: 'Connect several node pairs in one step.',
    inputSchema: z.object({
      edges: z.array(z.object({
        sourceId: z.string(),
        targetId: z.string(),
        sourceHandle: z.string().optional(),
        targetHandle: z.string().optional(),
      })).min(1).max(AGENT_BATCH_LIMIT),
    }),
  }),
  focusNode: tool({
    description: 'Pan the canvas to a node.',
    inputSchema: z.object({
      nodeId: z.string(),
    }),
  }),
  renameProject: tool({
    description: 'Rename the open project.',
    inputSchema: z.object({
      name: z.string().min(1),
    }),
  }),
  openProject: tool({
    description: 'Navigate the browser to a project canvas or Flow thread.',
    inputSchema: z.object({
      projectId: z.string(),
      origin: z.enum(['canvas', 'flow']).optional(),
    }),
  }),
}

export type ClientToolName = keyof typeof clientToolDefs
