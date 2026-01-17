/**
 * Proxy route for Resy's geoip API.
 * This route forwards the user's IP address to Resy's API to avoid CORS issues.
 * The client-side getGeoIP() function calls this route.
 */
import { NextRequest, NextResponse } from 'next/server'

const RESY_API_KEY = process.env.RESY_API_KEY || ''

export async function GET(request: NextRequest) {
  try {
    // Get the user's IP address from the request
    // Check various headers that might contain the real client IP
    const forwardedFor = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const cfConnectingIp = request.headers.get('cf-connecting-ip') // Cloudflare
    
    // Extract the first IP from x-forwarded-for (it can contain multiple IPs)
    const clientIp = cfConnectingIp || 
                     (forwardedFor ? forwardedFor.split(',')[0].trim() : null) || 
                     realIp || 
                     'unknown'
    
    const headers: HeadersInit = {
      'authorization': `ResyAPI api_key="${RESY_API_KEY}"`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      'accept': 'application/json, text/plain, */*',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'origin': 'https://resy.com',
      'referer': 'https://resy.com/',
      'x-origin': 'https://resy.com',
    }
    
    // Forward the user's IP so Resy's geoip can use it
    // Try multiple common headers that geoip services might check
    if (clientIp !== 'unknown') {
      headers['x-forwarded-for'] = clientIp
      headers['x-real-ip'] = clientIp
      headers['x-client-ip'] = clientIp
    }
    
    const response = await fetch('https://api.resy.com/3/geoip', {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'GeoIP request failed' }))
      return NextResponse.json(
        { error: errorData.error || 'GeoIP request failed' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[GeoIP] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

