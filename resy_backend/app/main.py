# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.api.v1.resy_routes import router as resy_router
from app.core.logging import RequestLoggingMiddleware
from app.core.config import settings
from app.services.clientManager import ClientManager

# Initialize client manager singleton
client_manager = ClientManager()

# Initialize scheduler
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start the scheduler
    scheduler.start()
    scheduler.add_job(
        client_manager.clean_up_old_clients,
        "interval",
        minutes=5,  # Run cleanup every 5 minutes
        id="cleanup_old_clients",
        replace_existing=True,
    )
    yield
    # Shutdown: Stop the scheduler
    scheduler.shutdown()


app = FastAPI(title="Resy Backend API", lifespan=lifespan)

# Add request logging middleware (should be after error handlers but before other middleware)
# app.add_middleware(RequestLoggingMiddleware)

# CORS configuration - supports development and production
# Parse CORS origins from environment variable
cors_origins = settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS != "*" else ["*"]
cors_origins = [origin.strip() for origin in cors_origins]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resy_router, prefix="/api/v1")


@app.get("/")
def root():
    return {"message": "Resy backend is up. See /docs for API."}
