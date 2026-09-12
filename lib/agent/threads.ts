import type { Sql } from '@/lib/db'

let ready = false

export async function ensureAgentThreadsSchema(sql: Sql) {
  if (ready) return
  await sql`
    CREATE TABLE IF NOT EXISTS agent_threads (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title       text NOT NULL DEFAULT 'New chat',
      project_id  text,
      surface     text NOT NULL DEFAULT 'canvas',
      messages    jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_agent_threads_updated ON agent_threads (updated_at DESC)`
  ready = true
}

export type AgentThreadSummary = {
  id: string
  title: string
  projectId: string | null
  surface: string
  updatedAt: string
}

export type AgentThread = AgentThreadSummary & {
  messages: unknown[]
  createdAt: string
}
