# Settings Information Architecture

## Default Layer

The default settings experience should stay focused on daily reader maintenance:

- addon feature toggles
- personal toolbox visibility toggle
- storage usage
- export / clear local data
- product/about information

This layer must remain safe for ordinary reading users and should avoid operational jargon.

## Advanced Layer

Advanced controls stay hidden behind toolbox mode and include:

- agent routing metrics and runtime overrides
- source package import and diagnostics
- debugging workbench entry points such as source builder and replace rules

These controls are intentionally grouped together because they are operational surfaces, not reading preferences.

## Placement Rules

- New day-to-day reader preferences belong in the default layer.
- New debugging, governance, or rollout controls belong in the advanced layer.
- Avoid adding advanced panels directly between maintenance and about sections in the default view.
