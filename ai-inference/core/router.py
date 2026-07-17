"""HTTP routes for the AI inference service."""

from fastapi import APIRouter, Request

from core.schemas import DecodeRequest, DecodeResponse, ScanRequest, ScanResult, HealthResponse
from pipelines.decode import decode_pipeline
from pipelines.scan import scan_pipeline

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok")


@router.post("/decode", response_model=DecodeResponse)
async def decode(req: DecodeRequest, request: Request):
    engine = request.app.state.engine
    return await decode_pipeline(req, engine)


@router.post("/scan", response_model=ScanResult)
async def scan(req: ScanRequest, request: Request):
    engine = request.app.state.engine
    return await scan_pipeline(req, engine)
