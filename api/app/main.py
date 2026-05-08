from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import classify as classify_routes
from app.routes import extract as extract_routes
from app.routes import health as health_routes

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
