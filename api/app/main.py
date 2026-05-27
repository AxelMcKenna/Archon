from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.rate_limit import limiter
from app.routes import address_checklist as address_checklist_routes
from app.routes import address_suggest as address_suggest_routes
from app.routes import attachments as attachments_routes
from app.routes import cad as cad_routes
from app.routes import classify as classify_routes
from app.routes import debug_env as debug_env_routes
from app.routes import documents as documents_routes
from app.routes import drafts as drafts_routes
from app.routes import export as export_routes
from app.routes import extract as extract_routes
from app.routes import forecasting as forecasting_routes
from app.routes import form_templates as form_templates_routes
from app.routes import health as health_routes
from app.routes import letters as letters_routes
from app.routes import plans as plans_routes
from app.routes import risk as risk_routes
from app.ingestion import routes as ingest_routes

app = FastAPI(title="ATLAS RFI API", version="0.1.0")
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"error": "rate limit exceeded", "detail": str(exc.detail)},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://atlas-web.vercel.app",
    ],
    allow_origin_regex=(
        r"http://(localhost|127\.0\.0\.1)(:\d+)?"
        r"|https://atlas-web-[a-z0-9-]+-axel-mckennas-projects\.vercel\.app"
        r"|https://atlas-[a-z0-9]+-axel-mckennas-projects\.vercel\.app"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_routes.router)
app.include_router(extract_routes.router, prefix="/extract", tags=["extract"])
app.include_router(letters_routes.router, prefix="/letters", tags=["letters"])
app.include_router(letters_routes.items_router, prefix="/items", tags=["items"])
app.include_router(classify_routes.router, prefix="/classify", tags=["classify"])
app.include_router(
    classify_routes.reconciliation_router, prefix="/reconciliation", tags=["reconciliation"]
)
app.include_router(drafts_routes.router, prefix="/draft", tags=["draft"])
app.include_router(attachments_routes.router, prefix="/attachments", tags=["attachments"])
app.include_router(export_routes.router, prefix="/export", tags=["export"])
app.include_router(risk_routes.router, prefix="/risk", tags=["risk"])
app.include_router(plans_routes.router, prefix="/plans", tags=["plans"])
app.include_router(cad_routes.router, prefix="/cad", tags=["cad"])
app.include_router(
    address_checklist_routes.router, prefix="/address-to-checklist", tags=["address-to-checklist"]
)
app.include_router(
    address_suggest_routes.router, prefix="/address-suggest", tags=["address-suggest"]
)
app.include_router(documents_routes.router, prefix="/api/resolve-documents", tags=["documents"])
app.include_router(forecasting_routes.router, prefix="/api", tags=["forecasting"])
app.include_router(form_templates_routes.router, prefix="/api/templates", tags=["templates"])
app.include_router(ingest_routes.router, prefix="/admin/ingest", tags=["admin-ingest"])

# /debug/env leaks env-shape info. Only mount it outside production.
if get_settings().env != "prod":
    app.include_router(debug_env_routes.router, prefix="/debug/env", tags=["debug"])
