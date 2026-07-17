"""Full-chapter scan pipeline.

Analyzes an entire chapter, extracting:
  - Alias/entity references with canonical mapping candidates
  - Event references with descriptions
  - Cross-chapter consistency hints
"""

from core.schemas import ScanRequest, ScanResult
from prompts.scan import SCAN_SYSTEM_PROMPT, build_scan_prompt


async def scan_pipeline(req: ScanRequest, engine) -> ScanResult:
    prompt = build_scan_prompt(
        book_id=req.book_id,
        chapter_index=req.chapter_index,
        chapter_title=req.chapter_title,
        chapter_text=req.chapter_text,
    )

    result = await engine.infer(
        system=SCAN_SYSTEM_PROMPT,
        prompt=prompt,
    )

    return parse_scan_result(result, req)


def parse_scan_result(raw: str, req: ScanRequest) -> ScanResult:
    import json
    import re

    json_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not json_match:
        return ScanResult(book_id=req.book_id, chapter_index=req.chapter_index)

    try:
        data = json.loads(json_match.group())
        return ScanResult(
            book_id=req.book_id,
            chapter_index=req.chapter_index,
            aliases=data.get("aliases", []),
            events=data.get("events", []),
            confidence=data.get("confidence", "low"),
        )
    except (json.JSONDecodeError, KeyError):
        return ScanResult(book_id=req.book_id, chapter_index=req.chapter_index)
