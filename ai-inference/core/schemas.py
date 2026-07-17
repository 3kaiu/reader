"""Pydantic request/response models."""

from pydantic import BaseModel, Field
from typing import Optional


# ── Shared enums ──────────────────────────────────────────────────

class ConfidenceLevel(str):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class MappingCategory(str):
    PERSON = "person"
    PLACE = "place"
    EVENT = "event"
    FACTION = "faction"
    MEME = "meme"
    UNKNOWN = "unknown"


# ── Request ───────────────────────────────────────────────────────

class DecodeRequest(BaseModel):
    book_id: str
    chapter_index: int
    selected_text: str
    surrounding_text: str = ""
    context_meta: Optional[str] = None  # JSON-encoded known mappings


class ScanRequest(BaseModel):
    book_id: str
    chapter_index: int
    chapter_title: str = ""
    chapter_text: str


# ── Response ──────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str


class CandidateMapping(BaseModel):
    alias: str
    canonical: str
    category: str = MappingCategory.UNKNOWN
    confidence: float = 0.0
    context_clue: Optional[str] = None


class DecodeResponse(BaseModel):
    term: str
    explanation: Optional[str] = None
    candidate_mappings: list[CandidateMapping] = Field(default_factory=list)
    confidence: str = ConfidenceLevel.LOW


class AliasEntry(BaseModel):
    alias: str
    canonical: Optional[str] = None
    category: str = MappingCategory.UNKNOWN
    first_seen_at: str = ""
    context_snippet: str = ""


class EventEntry(BaseModel):
    reference: str
    description: Optional[str] = None
    category: str = MappingCategory.UNKNOWN
    context_snippet: str = ""


class ScanResult(BaseModel):
    book_id: str
    chapter_index: int
    aliases: list[AliasEntry] = Field(default_factory=list)
    events: list[EventEntry] = Field(default_factory=list)
    confidence: str = ConfidenceLevel.LOW
