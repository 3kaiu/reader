# NXS Content Script (Restricted)

`content.script` in NXS is a restricted, line-based post-processing DSL executed **after** selector extraction and replace rules.

## Safety Model

- Not JavaScript.
- Only built-in commands are supported.
- Unknown commands are ignored and logged as warnings.
- Execution requires `content.script_enabled: true`.

## Supported Commands

- `trim`
  - Trims leading and trailing whitespace.
- `collapse_blank_lines`
  - Repeatedly collapses `\n\n\n` into `\n\n`.
- `replace::<regex>::<replacement>`
  - Applies Rust regex replacement globally.
- `remove::<regex>`
  - Removes text matching regex globally.

## Example

```yaml
content:
  body: ".chapter-content@text"
  script_enabled: true
  script: |
    # remove watermark line
    remove::(?m)^.*请收藏.*$ 
    replace::\u00A0:: 
    collapse_blank_lines
    trim
```

## Operational Notes

- Keep script small and deterministic.
- If script size exceeds 16KB, engine returns `ScriptMemoryExceeded`.
- Prefer `content.replace` for straightforward substitutions; use script for ordered, regex-heavy cleanup.
