/**
 * Compatibility entrypoint.
 *
 * Keep this file to avoid breaking old tooling/scripts that still reference
 * `unified-worker.ts`, while all actual implementation lives in `entry.ts`.
 */

export { default } from './entry.ts'
