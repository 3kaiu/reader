"""Prompt templates for the decode (on-demand query) pipeline."""

from prompts.system import ROLE_DECODER, OUTPUT_CONSTRAINTS

DECODE_SYSTEM_PROMPT = f"""{ROLE_DECODER}

{OUTPUT_CONSTRAINTS}

输出格式：
{{
  "term": "用户选中的词",
  "explanation": "简短的一两句话解释（可选）",
  "candidate_mappings": [
    {{
      "alias": "代指",
      "canonical": "规范名",
      "category": "person|place|event|faction|meme|unknown",
      "confidence": 0.95,
      "context_clue": "上下文中的线索原文（可选）"
    }}
  ],
  "confidence": "high|medium|low"
}}"""


def build_decode_prompt(
    book_id: str,
    chapter_index: int,
    selected_text: str,
    surrounding_text: str = "",
    context_meta: str | None = None,
) -> str:
    parts = [
        f"小说ID: {book_id}",
        f"章节: 第 {chapter_index} 章",
        "",
        f'选中文本: "{selected_text}"',
    ]

    if surrounding_text:
        parts.extend([
            "",
            "上下文:",
            surrounding_text,
        ])

    if context_meta:
        parts.extend([
            "",
            "已知映射（用户已确认的，可供参考）:",
            context_meta,
        ])

    parts.extend([
        "",
        "请推断选中文本指代什么。",
    ])

    return "\n".join(parts)
