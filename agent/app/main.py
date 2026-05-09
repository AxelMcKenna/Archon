from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.rate_limit import limiter
from app.routes import chat as chat_routes

settings = get_settings()

app = FastAPI(title="ConsentIQ Agent", version="0.1.0")
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
    allow_origins=settings.allowed_origins_list,
    allow_origin_regex=(
        r"http://(localhost|127\.0\.0\.1)(:\d+)?"
        r"|https://consentiq-web-[a-z0-9-]+-axel-mckennas-projects\.vercel\.app"
        r"|https://consentiq-[a-z0-9]+-axel-mckennas-projects\.vercel\.app"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "agent"}


app.include_router(chat_routes.router, prefix="/chat", tags=["chat"])
