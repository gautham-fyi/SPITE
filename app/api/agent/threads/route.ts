import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { ensureAgentThreadsSchema } from '@/lib/agent/threads'

export async function GET() {
  try {
    const sql = getDb()
    await ensureAgentThreadsSchema(sql)
    const rows = await sql`
      SELECT id, title, project_id, surface, updated_at
      FROM agent_threads
      ORDER BY updated_at DESC
      LIMIT 80
    `
    return NextResponse.json(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        projectId: row.project_id,
        surface: row.surface,
        updatedAt: row.updated_at,
      })),
    )
  } catch (error) {
    console.error('[agent/threads] list failed:', error)
    return NextResponse.json({ error: 'Failed to load threads' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sql = getDb()
    await ensureAgentThreadsSchema(sql)
    const body = await request.json().catch(() => ({}))
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'New chat'
    const projectId = typeof body.projectId === 'string' ? body.projectId : null
    const surface = body.surface === 'dashboard' ? 'dashboard' : 'canvas'

    const rows = await sql`
      INSERT INTO agent_threads (title, project_id, surface)
      VALUES (${title}, ${projectId}, ${surface})
      RETURNING id, title, project_id, surface, messages, created_at, updated_at
    `
    const row = rows[0]
    return NextResponse.json({
      id: row.id,
      title: row.title,
      projectId: row.project_id,
      surface: row.surface,
      messages: row.messages ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  } catch (error) {
    console.error('[agent/threads] create failed:', error)
    return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 })
  }
}
