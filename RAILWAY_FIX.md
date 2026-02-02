# Railway 502 Error Fix

## Problem
Your Railway backend is returning 502 errors because it's not listening on the correct port. Railway provides a `PORT` environment variable, but your app was hardcoded to port 8000.

## Solution

### Option 1: Update Railway Start Command (If NOT using Docker)

1. Go to your Railway project dashboard
2. Select your backend service
3. Go to **Settings** → **Deploy**
4. Find **Start Command**
5. Set it to:
   ```
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
6. Save and redeploy

### Option 2: If Using Docker

The Dockerfile has been updated to use the `PORT` environment variable. Just:
1. Commit and push the updated `Dockerfile`
2. Railway will rebuild with the new configuration

### Option 3: Use the Startup Script

If the above doesn't work, you can use the `start.sh` script:

1. In Railway Settings → Deploy → Start Command, set:
   ```
   bash start.sh
   ```
2. Make sure the script is executable (Railway should handle this)

## Verify It's Working

After redeploying, check:
1. Railway logs should show: `Starting server on port <number>`
2. The port number should match Railway's assigned PORT (not 8000)
3. HTTP requests should return 200 instead of 502

## Common Issues

- **Still getting 502**: Make sure you redeployed after changing the start command
- **Port binding error**: Check Railway logs for the actual error message
- **Environment variables**: Make sure all required env vars are set in Railway
