# Resy

Restaurant reservation booking system built on Resy's API.

## What It Does

Browse restaurants, check availability, and book reservations through Resy. Find slots by date, preview bookings, and complete reservations.

## Built With

**Backend:**
- FastAPI (Python)
- APScheduler for background tasks

**Frontend:**
- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Radix UI components

## API Endpoints

- `POST /api/v1/resy/login` - Authenticate with Resy
- `POST /api/v1/resy/getID` - Extract venue ID from Resy URL
- `POST /api/v1/resy/slots` - Get available reservation slots
- `POST /api/v1/resy/calendar` - Get available dates for a venue
- `POST /api/v1/resy/reservation/preview` - Preview reservation details
- `POST /api/v1/resy/reservation/book` - Confirm booking

## Future Plans

- Integrate OpenTable API
- ExploreTok integration for restaurant discovery

