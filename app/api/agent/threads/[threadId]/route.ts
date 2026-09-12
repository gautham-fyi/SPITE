import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { ensureAgentThreadsSchema } from '@/lib/agent/threads'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params
    const sql = getDb()
    await ensureAgentThreadsSchema(sql)
    const rows = await sql`
      SELECT id, title, project_id, surface, messages, created_at, updated_at
      FROM agent_threads
      WHERE id = ${threadId}
    `
    if (!rows[0]) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
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
    console.error('[agent/threads] get failed:', error)
    return NextResponse.json({ error: 'Failed to load thread' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params
    const sql = getDb()
    await ensureAgentThreadsSchema(sql)
    const body = await request.json()
    const title = typeof body.title === 'string' ? body.title.trim() : undefined
    const messages = Array.isArray(body.messages) ? body.messages : undefined

    const rows = await sql`
      UPDATE agent_threads
      SET
        title = COALESCE(${title ?? null}, title),
        messages = COALESCE(${messages ? JSON.stringify(messages) : null}::jsonb, messages),
        updated_at = now()
      WHERE id = ${threadId}
      RETURNING id, title, project_id, surface, messages, created_at, updated_at
    `
    if (!rows[0]) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
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
    console.error('[agent/threads] update failed:', error)
    return NextResponse.json({ error: 'Failed to save thread' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params
    const sql = getDb()
    await ensureAgentThreadsSchema(sql)
    await sql`DELETE FROM agent_threads WHERE id = ${threadId}`
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[agent/threads] delete failed:', error)
    return NextResponse.json({ error: 'Failed to delete thread' }, { status: 500 })
  }
}
