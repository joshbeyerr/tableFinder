# Resy

Restaurant reservation booking system built on Resy's API.

## Why

I was always finding myself unable to get reservations at busier restaurants throughout the city, especially last minute. This tool helps automate the booking process.

## What It Does

Browse restaurants, check availability, and book reservations through Resy. Find slots by date, preview bookings, and complete reservations.

## Screenshots

Backend API screens:

<img src="photos/resy1.png" alt="Backend Screen 1" width="400" />
<img src="photos/resy2.jpg" alt="Backend Screen 2" width="400" />

Monitoring mode:

<img src="photos/monitoring.jpg" alt="Monitoring Mode" width="600" />

Successful booking at Danny's Pizza Tavern:

<img src="photos/booked2.jpg" alt="Successful Booking" width="600" />

Confirmation email:

<img src="photos/itsreal!.jpg" alt="Confirmation Email" width="600" />

<img src="photos/smile.jpg" alt="Success!" width="300" />

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

## Setup

If you're cloning and using this project, make sure to set your backend `.env` `MODE` to `production`. Otherwise, it will not fully complete the booking process (development mode skips actual bookings).

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

