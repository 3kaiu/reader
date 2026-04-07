/**
 * Compatibility entrypoint.
 *
 * Keep this file to avoid breaking old tooling/scripts that still reference
 * `unified-worker.ts`, while all actual implementation lives in `entry.ts`.
 *
 * Deprecation window:
 * - Deprecated on 2026-04-07
 * - Planned removal after 2026-05-31 once all external references are migrated
 */

export { default } from './entry.ts'
