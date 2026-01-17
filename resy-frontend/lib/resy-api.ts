/**
 * Client-side Resy API utilities
 * These functions call Resy's API directly from the browser
 * 
 * NOTE: Using NEXT_PUBLIC_ prefix exposes the API key to the client.
 * This is necessary for direct browser calls but means the key will be visible in the bundle.
 */

const RESY_API_KEY = process.env.NEXT_PUBLIC_RESY_API_KEY || process.env.RESY_API_KEY || ''

export interface GeoIPResponse {
  ip: string
  latitude: number
  longitude: number
  country_iso_code: string
  is_in_eu: boolean
  source: string
  success: boolean
}

/**
 * Get user's location based on their IP address
 * Uses Next.js API route to proxy the request (avoids CORS issues)
 * The API route forwards the user's IP to Resy's API
 * 
 * @returns Promise with geo location data including latitude and longitude
 */
export async function getGeoIP(): Promise<GeoIPResponse> {
  // Use our Next.js API route which proxies to Resy's API
  // This avoids CORS issues and allows the server to forward the user's IP
  const response = await fetch('/api/resy/geoip', {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'GeoIP request failed' }))
    throw new Error(errorData.error || 'Failed to get location')
  }

  return await response.json()
}

