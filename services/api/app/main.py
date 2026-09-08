from fastapi import FastAPI


APP_NAME = "ClaimLens AI API"
APP_VERSION = "0.2.0"

app = FastAPI(
    title=APP_NAME,
    description="Backend API foundation for the ClaimLens AI research pipeline",
    version=APP_VERSION,
)


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
