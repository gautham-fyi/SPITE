import { NextResponse } from 'next/server'
import { getProjectSpend } from '@/lib/spend-gate'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }
  try {
    const spend = await getProjectSpend(projectId)
    return NextResponse.json(spend)
  } catch (err) {
    console.error('[spend] project total failed:', err)
    return NextResponse.json({ error: 'Failed to load spend' }, { status: 500 })
  }
}
