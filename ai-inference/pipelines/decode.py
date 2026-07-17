"""Single-term decode pipeline.

Takes a selected term + surrounding context, runs inference,
and returns candidate mappings with confidence scores.
"""

from core.schemas import DecodeRequest, DecodeResponse
from prompts.decode import DECODE_SYSTEM_PROMPT, build_decode_prompt


async def decode_pipeline(req: DecodeRequest, engine) -> DecodeResponse:
    prompt = build_decode_prompt(
        book_id=req.book_id,
        chapter_index=req.chapter_index,
        selected_text=req.selected_text,
        surrounding_text=req.surrounding_text,
        context_meta=req.context_meta,
    )

    result = await engine.infer(
        system=DECODE_SYSTEM_PROMPT,
        prompt=prompt,
    )

    return parse_decode_response(result, term=req.selected_text)


def parse_decode_response(raw: str, term: str) -> DecodeResponse:
    """Parse structured JSON from model output, with fallback."""
    import json
    import re

    # Extract JSON block from potential markdown fencing
    json_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not json_match:
        return DecodeResponse(term=term)

    try:
        data = json.loads(json_match.group())
        return DecodeResponse(
            term=data.get("term", term),
            explanation=data.get("explanation"),
            candidate_mappings=data.get("candidate_mappings", []),
            confidence=data.get("confidence", "low"),
        )
    except (json.JSONDecodeError, KeyError):
        return DecodeResponse(term=term)
