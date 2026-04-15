# Settings Information Architecture

## Current Scope

The settings page is now intentionally minimal and serves two goals only:

- source package import / inspection / delete for runtime rule maintenance
- product/about information for app context

## Design Principles

- No toolbox mode, addon toggles, or hidden advanced layer.
- No operational routing/debug panels inside reader settings.
- Keep wording focused on reading/runtime maintenance, avoid platform-infra jargon.

## Placement Rules

- New source maintenance controls belong in `SettingsSourcePackagesSection`.
- Product/legal/version content belongs in `SettingsAboutSection`.
- Do not reintroduce hidden "advanced" layers or toolbox gating in settings.
