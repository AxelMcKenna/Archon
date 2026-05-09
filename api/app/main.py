from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import classify as classify_routes
from app.routes import documents as documents_routes
from app.routes import address_suggest as address_suggest_routes
from app.routes import debug_env as debug_env_routes
from app.routes import extract as extract_routes
from app.routes import health as health_routes
from app.routes import address_checklist as address_checklist_routes

app = FastAPI(title="ConsentIQ RFI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_routes.router)
app.include_router(extract_routes.router, prefix="/extract", tags=["extract"])
app.include_router(classify_routes.router, prefix="/classify", tags=["classify"])
app.include_router(address_checklist_routes.router, prefix="/address-to-checklist", tags=["address-to-checklist"])
app.include_router(address_suggest_routes.router, prefix="/address-suggest", tags=["address-suggest"])
app.include_router(documents_routes.router, prefix="/api/resolve-documents", tags=["documents"])
app.include_router(debug_env_routes.router, prefix="/debug/env", tags=["debug"])
