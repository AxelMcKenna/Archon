import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.ingestion import routes as ingest_routes
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
from app.routes import specs as specs_routes

log = logging.getLogger("app")

app = FastAPI(title="ARRO RFI API", version="0.1.0")
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"error": "rate limit exceeded", "detail": str(exc.detail)},
    )


@app.exception_handler(StarletteHTTPException)
async def _http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    # Mirror the detail into an ``error`` key so the web client (which reads
    # ``error``/``message``) and legacy callers (which read ``detail``) both
    # get a usable message from a single consistent shape.
    detail = exc.detail if isinstance(exc.detail, str) else "request failed"
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": detail, "detail": exc.detail},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Keep FastAPI's structured ``detail`` list (the client formats it) and add
    # a flat ``error`` summary for clients that only read a single string.
    return JSONResponse(
        status_code=422,
        content={"error": "validation error", "detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def _unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    # Catch-all: log the full traceback server-side, but never leak it to the
    # client. Returns a consistent ``{"error": ...}`` shape with a 500 status.
    log.exception("unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "internal server error"},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://arro-web.vercel.app",
    ],
    allow_origin_regex=(
        r"http://(localhost|127\.0\.0\.1)(:\d+)?"
        r"|https://arro-web-[a-z0-9-]+-axel-mckennas-projects\.vercel\.app"
        r"|https://arro-[a-z0-9]+-axel-mckennas-projects\.vercel\.app"
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
app.include_router(specs_routes.router, prefix="/specs", tags=["specs"])
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
