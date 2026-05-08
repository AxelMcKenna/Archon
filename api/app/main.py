from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import attachments as attachments_routes
from app.routes import classify as classify_routes
from app.routes import drafts as drafts_routes
from app.routes import export as export_routes
from app.routes import extract as extract_routes
from app.routes import health as health_routes
from app.routes import letters as letters_routes
from app.routes import plans as plans_routes
from app.routes import risk as risk_routes

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
