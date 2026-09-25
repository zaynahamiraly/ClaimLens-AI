from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import auth, claims, profile


APP_NAME = "ClaimLens AI API"
APP_VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.http = httpx.AsyncClient(timeout=httpx.Timeout(60.0))
    yield
    await application.state.http.aclose()

app = FastAPI(
    title=APP_NAME,
    description="Mobile API gateway for ClaimLens AI",
    version=APP_VERSION,
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(profile.router, prefix="/api/v1")
app.include_router(claims.router, prefix="/api/v1")


@app.get("/", tags=["service"])
def root() -> dict[str, str]:
    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "status": "running",
    }


@app.get("/api/v1/health", tags=["service"])
def health_check() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": APP_NAME,
        "version": APP_VERSION,
    }
