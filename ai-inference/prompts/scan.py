"""Prompt templates for the full-chapter scan pipeline."""

from prompts.system import ROLE_DECODER, OUTPUT_CONSTRAINTS

SCAN_SYSTEM_PROMPT = f"""{ROLE_DECODER}

你的任务：阅读整章文本，提取：
1. 人物代指/别名（现实人物 vs 虚构人物）
2. 事件隐喻/影射
3. 派系/组织指代
4. 地点映射

{OUTPUT_CONSTRAINTS}

输出格式：
{{
  "aliases": [
    {{
      "alias": "代指名称",
      "canonical": "规范名/推断指向（留 null 如果不能确定）",
      "category": "person|place|event|faction|meme|unknown",
      "first_seen_at": "首次出现位置（前 20 字上下文）",
      "context_snippet": "包含该代指的关键上下文片段"
    }}
  ],
  "events": [
    {{
      "reference": "事件代称",
      "description": "可能指向的真实事件描述（可选）",
      "category": "event|unknown",
      "context_snippet": "包含该事件指代的关键上下文片段"
    }}
  ],
  "confidence": "high|medium|low"
}}"""


def build_scan_prompt(
    book_id: str,
    chapter_index: int,
    chapter_title: str = "",
    chapter_text: str = "",
) -> str:
    parts = [
        f"小说ID: {book_id}",
        f"章节: 第 {chapter_index} 章",
    ]

    if chapter_title:
        parts.append(f"标题: {chapter_title}")

    parts.extend([
        "",
        "全文开始:",
        "---",
        chapter_text,
        "---",
        "",
        "请提取本章中的所有代指、别名和事件隐喻。",
    ])

    return "\n".join(parts)
