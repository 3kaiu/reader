# Reader Architecture

## Runtime Flow

`/reader` mounts `useReaderView`, which assembles the reader runtime from three layers:

1. Services: shared store and platform dependencies such as `readerStore`, `settingsStore`, toast, eye-care hooks, and offline storage.
2. Features: session lifecycle, chrome visibility/control, and reading actions.
3. Models: `readerPageState/Actions` for shell-level UI state and `readerExperienceState/Actions` for immersive reading interactions.

## Data Flow

1. Router enters `/#/reader` with source/book targeting information.
2. Session feature resolves route target and initializes the reader session.
3. `readerStore` loads book info, chapters, chapter content, progress, and error diagnostics.
4. Page model exposes theme, loading, and error shell state.
5. Experience model exposes content, toolbar, modal, navigation, and reading action bindings.
6. Reader components consume only model state/actions; they do not call store operations directly.

## Responsibility Boundaries

- `stores/reader/*`: canonical reader domain state and async operations.
- `composables/useReaderSession.ts`: route target resolution and lifecycle bootstrap.
- `composables/useReaderChrome.ts`: fullscreen, toolbar, modal, and keyboard shell controls.
- `composables/useReaderActions.ts`: reading-specific actions such as chapter navigation and theme actions.
- `components/reader/*`: presentation and DOM event wiring.

## Convergence Rules

- Keep store domain boundaries intact; avoid pushing async reader logic into components.
- Prefer removing wrapper-only files that only forward arguments without adding reader-specific meaning.
- Keep page-level state limited to shell concerns; content/navigation interactions belong to the experience model.

## Component Graph

The current reader component tree converges around one orchestration node and three presentation subgraphs:

1. `ReaderExperience.vue` / `ReaderExperienceLayout.vue`
   - The component shell that receives the experience binding contract from composables and fans it out to toolbar, content, and modal regions.
2. Toolbar chain
   - `ReaderToolbar.vue` -> `ReaderToolbarPanels.vue` -> top and bottom bar components.
   - This chain owns DOM event wiring for chrome actions, but does not own reader session logic.
3. Content chain
   - `ReaderContent.vue` -> `ReaderContentViewport.vue` -> scroll content and chapter list components.
   - This chain owns rendered content structure, load-state visuals, and content click dispatch.
4. Modal chain
   - `ReaderModals.vue` -> `ReaderModalsPanels.vue` -> settings, chapter list, source picker, book info, and keyboard help surfaces.
   - This chain owns modal composition only; it does not derive reader state itself.

## Architecture Review

### What Converged Well

- The reader runtime split is now clearer: `composables/reader/*` owns state derivation and action contracts, while `components/reader/*` stays presentation-oriented.
- Most low-value wrapper files have been removed from both `composables/reader` and `components/reader`.
- Internal binding result and view-binding types now live closer to the functions that actually create them, which reduces cross-file alias churn.
- A narrow but useful reader binding test slice now protects toolbar, modal, navigation, overlay, load-state, and fullscreen viewport behavior.

### Remaining Naming Risk

The primary remaining complexity is now in `composables/reader/*`, not `components/reader/*`.

- `components/reader/*`
  - Most low-value aliases are already gone.
  - The main risk here is inconsistent local naming such as `props` vs `bindings` vs `viewBindings`, not excess file count.
- `composables/reader/*`
  - Naming still mixes domain nouns (`experience`, `page`, `chrome`, `session`) with transport nouns (`state`, `options`, `bindings`, `result`, `types`) in ways that are not always predictable.
  - This area should be governed by naming rules before further convergence work.

### Stable Boundaries To Keep

- `*-prop-types.ts`
  - Keep these when they describe an actual Vue component contract consumed by `defineProps`.
- `*-emit-types.ts`
  - Keep these as explicit event contracts. They carry real API meaning and should not be folded into arbitrary implementation files.
- `experience-*` / `view-*` composable contracts
  - Keep these when they mark the boundary between reader runtime state assembly and Vue presentation.
- feature-specific binding files with local logic
  - Keep these when they compute reader-specific state instead of merely re-exporting or renaming another type.

### Files We Intentionally Stopped Collapsing

- Toolbar `prop-types` and `emit-types`
  - These define the interactive API between toolbar components and should remain explicit.
- Modal `prop-types` and `emit-types`
  - These act as the contract between the experience layer and modal surfaces.
- Content and chapter prop contracts
  - These are useful because content rendering remains the most behavior-dense subtree in the reader.

### Event-Flow Review

The reader component tree should allow event forwarding only when that forwarding establishes a meaningful component boundary.

Allowed forwarding:

- boundary components such as `ReaderToolbar.vue`
  - These may forward a stable toolbar API upward because they define a public subtree boundary for the experience layout.
- boundary components such as `ReaderContent.vue`
  - These may forward load/retry events upward because they define the content-region contract consumed by the experience layout.
- modal aggregation components such as `ReaderModals.vue`
  - These may own emits only when they expose a stable modal-surface API to the parent layer.

Preferred leaf pattern:

- leaf interaction components should prefer callback props over local emits when the parent already owns the interaction contract
  - This avoids re-declaring the same user intent at the leaf level when no extra semantic boundary is created.
- examples of this preferred pattern now include:
  - `ReaderScrollLoadActions.vue`
  - `ReaderToolbarTopBarContent.vue`
  - `ReaderToolbarBottomActions.vue`
  - `ReaderNavigationButton.vue`
  - `ReaderToolbarActionButton.vue`

Forwarding to avoid:

- forwarding through multiple layers when intermediate components add no semantic boundary
- keeping emit contracts that are never emitted in practice
- creating parallel event names for the same user intent at adjacent layers

Concrete finding from this audit:

- `toggleZenMode` was present in the bottom toolbar subtree but was not forwarded by `ReaderToolbar.vue`
  - This has been fixed so the toolbar boundary now forwards the full toolbar action contract consistently.
- `ReaderContentEmits.click` existed without any actual producer or consumer
  - This dead event contract was removed.
- several leaf reader components were carrying duplicate emits even though parent layers already owned the callbacks
  - these leaf contracts were collapsed into callback props for top-bar content, bottom actions, scroll load actions, navigation buttons, and toolbar action buttons.

## Termination Boundary

Further convergence should stop when a file does one of the following:

- defines a Vue component prop contract
- defines a Vue component emit contract
- marks a meaningful boundary between runtime state assembly and presentation
- contains actual reader-specific derivation logic rather than type forwarding

At this point, additional file deletion would mostly reduce naming variety, not architectural complexity.

## Naming Rules

Use the following naming rules for future reader work.

### Components

- `*-prop-types.ts`
  - Use only for `defineProps` contracts of concrete Vue components.
- `*-emit-types.ts`
  - Use only for `defineEmits` contracts of concrete Vue components.
  - Prefer not to create one for leaf components that only proxy button clicks back to an already-assembled parent callback contract.
- `*-view-bindings.ts`
  - Use when a file derives values specifically for one component's template-facing consumption.
- `*-bindings.ts`
  - Use when a file assembles a local subtree contract from other bindings or prop sources.
- `*Props`
  - Means a shape that can be passed to a component boundary.
- `*Bindings`
  - Means a shape that contains computed values, callbacks, or local assembly details for an internal subtree.

### Composables

- `*-state.ts`
  - Use for canonical assembled state objects.
- `*-actions.ts`
  - Use for callable action groups.
- `*-options.ts`
  - Use only for constructor-style inputs to another factory function.
- `*-result-types.ts`
  - Keep only when a result type is consumed across more than one module boundary.
- `*-types.ts`
  - Keep only for domain contracts that are shared across multiple files and are not tied to a single factory.
- `view-*`
  - Reserve for top-level reader runtime assembly around services, features, and models.
- `experience-*`
  - Reserve for immersive reading state/actions that the component tree consumes.
- `page-*`
  - Reserve for shell-level page concerns such as loading, top-level error, theme shell state, and route-level coordination.

### Stop Conditions

Do not rename or merge a file if doing so would make any of these less clear:

- whether the shape is a Vue component contract or an internal assembly contract
- whether a function returns state, props, actions, or bindings
- whether a file belongs to page shell logic, immersive reading logic, chrome control, or session bootstrap

## Current Status

Completed in this phase:

1. Removed low-value wrapper and alias files across `components/reader` and parts of `composables/reader`.
2. Split settings IA into general vs advanced.
3. Aligned local test and Playwright config with the actual frontend dev server shape.
4. Added reader binding contract tests for toolbar, navigation, modals, load-state, keyboard help overlay, and fullscreen viewport.
5. Normalized a small set of inconsistent reader binding names such as `panelProps` -> `panelsProps`.
6. Began event-flow audit and fixed a real toolbar event forwarding gap.
7. Collapsed several leaf reader emits boundaries into callback props where no semantic boundary existed.
8. Extended that callback-props rule to reusable leaf button components in the navigation and toolbar action subtrees.

Not yet started:

1. Full event-flow audit from `ReaderExperience` to every leaf reader component.
2. Naming normalization pass across the remaining `composables/reader/*` surface.
3. Component-level DOM tests with a browser-like environment.

## Next-Stage Technical Plan

The next phase should focus on architecture quality rather than file count:

1. Normalize naming across `composables/reader/*`, especially `view-*`, `experience-*`, and `page-*` option/result/type files.
2. Audit event flow from `ReaderExperience` down to leaf components and remove pass-through emits that add no semantic value.
3. If stronger UI assurance is needed, add Vue component DOM tests with an explicit browser-capable test environment rather than stretching the current node-only setup.
4. Keep future convergence incremental: delete pure bridges first, then inline single-use local result types, and stop before touching public component contracts.
