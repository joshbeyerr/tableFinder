import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
const API_KEY = process.env.API_KEY || 'super-secret-dev-key'

async function proxy(request: NextRequest, method: 'GET' | 'POST') {
  const taskId = request.headers.get('x-task-id')
  if (!taskId) {
    return NextResponse.json({ error: 'Missing x-task-id header' }, { status: 400 })
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/monitors`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-task-id': taskId,
      },
      body: method === 'POST' ? JSON.stringify(await request.json()) : undefined,
      cache: 'no-store',
    })
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error: any) {
    console.error('[monitors] proxy error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export const GET = (request: NextRequest) => proxy(request, 'GET')
export const POST = (request: NextRequest) => proxy(request, 'POST')
