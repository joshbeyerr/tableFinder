import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
const API_KEY = process.env.API_KEY || 'super-secret-dev-key'
// Resy API key - can be set in .env.local (server-side only, not exposed to client)
const RESY_API_KEY = process.env.RESY_API_KEY || ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const taskId = request.headers.get('x-task-id')

    if (!taskId) {
      return NextResponse.json({ error: 'Missing x-task-id header' }, { status: 400 })
    }

    // If resy_token is provided, forward it directly to backend
    // Otherwise, if email/password provided, authenticate client-side first
    let requestBody = body
    let resyTokenForCache: string | null = null
    
    if (body.email && body.password && !body.resy_token) {
      // Client-side authentication with Resy API
      try {
        const resyAuthResponse = await fetch('https://api.resy.com/4/auth/password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'authorization': `ResyAPI api_key="${RESY_API_KEY}"`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            'accept': 'application/json, text/plain, */*',
          },
          body: new URLSearchParams({
            email: body.email,
            password: body.password,
          }),
        })

        if (!resyAuthResponse.ok) {
          const errorData = await resyAuthResponse.json().catch(() => ({ error: 'Authentication failed' }))
          return NextResponse.json(
            { error: errorData.error || 'Resy authentication failed' },
            { status: resyAuthResponse.status }
          )
        }

        const resyData = await resyAuthResponse.json()
        const resyToken = resyData.token

        if (!resyToken) {
          return NextResponse.json(
            { error: 'No token received from Resy' },
            { status: 500 }
          )
        }

        // Forward only the token to backend
        requestBody = { resy_token: resyToken }
        resyTokenForCache = resyToken
      } catch (error: any) {
        console.error('[Login] Resy auth error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to authenticate with Resy' },
          { status: 500 }
        )
      }
    }

    // Forward to backend
    const response = await fetch(`${BACKEND_URL}/api/v1/resy/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-task-id': taskId,
      },
      body: JSON.stringify(requestBody),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    // Include resy_token in response for client-side caching (if we authenticated)
    if (resyTokenForCache) {
      return NextResponse.json({
        ...data,
        resy_token: resyTokenForCache, // Include for caching
      })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[Login] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

