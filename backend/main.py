"""VyOS Web API - Main Application Entry Point"""
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from loguru import logger
from pydantic import BaseModel

from app.api.v1 import auth, backup, logs, network, system, users, vpn
from app.api.v1 import firewall_final as firewall
from app.api.v1 import bgp, isis

BACKEND_VERSION = "0.0.1-20250221"

# Determine static files path - check common locations
STATIC_PATHS = [
    Path("../frontend/dist"),
    Path("/opt/vyos-webui/frontend/dist"),
    Path("./frontend/dist"),
]

static_dir = None
for path in STATIC_PATHS:
    if path.exists() and path.is_dir():
        static_dir = path
        logger.info(f"Found static files at: {static_dir}")
        break

app = FastAPI(
    title="VyOS Web API",
    description="API for VyOS router management",
    version=BACKEND_VERSION,
)

# CORS middleware configuration - allow all for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(system.router, prefix="/api/v1")
app.include_router(network.router, prefix="/api/v1")
app.include_router(firewall.router, prefix="/api/v1")
app.include_router(bgp.router, prefix="/api/v1")
app.include_router(isis.router, prefix="/api/v1")
app.include_router(vpn.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(logs.router, prefix="/api/v1")
app.include_router(backup.router, prefix="/api/v1")


class VersionResponse(BaseModel):
    """Version response model"""
    backend_version: str


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint"""
    logger.info("Health check requested")
    return {"status": "healthy"}


@app.get("/api/v1/version", response_model=VersionResponse)
async def get_version() -> VersionResponse:
    """Get backend version"""
    return VersionResponse(backend_version=BACKEND_VERSION)


# Serve static files (frontend) if available
if static_dir:
    logger.info(f"Mounting static files from: {static_dir}")
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        """Serve frontend application - handle SPA routing"""
        if path and (static_dir / path).exists() and not (static_dir / path).is_dir():
            return FileResponse(str(static_dir / path))
        # Fallback to index.html for SPA routing
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        return {"message": "Frontend not available", "version": BACKEND_VERSION}
else:
    logger.warning("No static files directory found, frontend will not be served")

    @app.get("/")
    async def root() -> dict[str, str]:
        """Root endpoint when frontend not available"""
        return {"message": "VyOS Web API", "version": BACKEND_VERSION}


if __name__ == "__main__":
    import uvicorn

    logger.info("Starting VyOS Web API...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
