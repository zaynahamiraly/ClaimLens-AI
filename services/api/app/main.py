from fastapi import FastAPI

app = FastAPI(
    title="ClaimLens AI API",
    description="Backend API for the AI-Assisted Health Insurance Claims Application",
    version="0.1.0",
)


@app.get("/")
def root():
    return {
        "name": "ClaimLens AI API",
        "version": "0.1.0",
        "status": "running",
    }


@app.get("/api/v1/health")
def health_check():
    return {
        "status": "healthy",
    }