import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
const API_KEY = process.env.API_KEY || 'super-secret-dev-key'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const taskId = request.headers.get('x-task-id')
  if (!taskId) {
    return NextResponse.json({ error: 'Missing x-task-id header' }, { status: 400 })
  }

  try {
    const { id } = await params
    const response = await fetch(`${BACKEND_URL}/api/v1/monitors/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-api-key': API_KEY, 'x-task-id': taskId },
    })
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error: any) {
    console.error('[monitors] cancel error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
