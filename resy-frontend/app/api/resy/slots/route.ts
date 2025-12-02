import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
const API_KEY = process.env.API_KEY || 'super-secret-dev-key'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const taskId = request.headers.get('x-task-id')

    if (!taskId) {
      return NextResponse.json({ error: 'Missing x-task-id header' }, { status: 400 })
    }

    const sessionToken = request.headers.get('x-session-token')
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'x-task-id': taskId,
    }
    
    // Forward session token if present
    if (sessionToken) {
      headers['x-session-token'] = sessionToken
    }
    
    const response = await fetch(`${BACKEND_URL}/api/v1/resy/slots`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[v0] Slots search error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

