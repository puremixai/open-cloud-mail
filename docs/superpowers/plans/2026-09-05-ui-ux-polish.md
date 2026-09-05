# UI / UX polish implementation plan

Goal: implement the approved audit while preserving Win95 and existing mail reliability protections.

Spec: `docs/ui-ux-audit-2026-09-05/README.md` (user approved implementation with “开始修改”).

Architecture: Vue 3 / Element Plus / Pinia; reusable accessible icon buttons and semantic tokens; account-isolated IndexedDB compose recovery; container-aware mail list. No framework migration or new production dependencies. Changes stay on `codex/ui-ux-polish`, in the user's existing checkout so the audited files and installed runtime remain immediately reviewable. No publishing or remote writes.

Execution: apply the subagent-driven-development workflow for bounded independent frontend tasks; primary agent owns composer persistence and integration. Shared localization is partitioned into `i18n/ux-common.js`, `ux-mail.js`, `ux-compose.js`, each exporting `{ zh, en }`; primary agent merges them under `ux` in `i18n/index.js`.

- [x] Task 1 — Accessible common UI: local SVG ActionIcon/IconButton component, focus and color tokens, login labels/autofill and immediate availability, header and Win95 semantic controls/hit areas, honest desktop shortcuts, settings danger area. Owner: common UI implementer. Files: global styles, components/icon-button, layout/header, layout/win95, views/login, views/setting, ux-common.js. Verify meaningful behavior with component tests; visual changes with browser inspection/build.
- [x] Task 2 — Mail workflow: label keyboard-accessible toolbar actions and mail rows; selection count/95 limit; container-driven list density matching virtual height; contextual empty/error states; detail attachment actions; sidebar preference preservation. Owner: mail UI implementer. Files: components/email-scroll, views/email, views/content, layout/index, ux-mail.js, relevant tests. Shared contract: IconButton accepts icon/action, label, loading, disabled and emits native click. Do not modify global CSS or other localization modules. Verify resize, selection and keyboard behavior with Vitest.
- [x] Task 3 — Composer protection: three explicit close choices; debounced per-user IndexedDB recovery including attachments; saved/dirty/failure feedback; unload protection for unsaved work; sending feedback and focus restoration. Owner: primary. Files: layout/write, utils/compose-recovery.js, db/db.js, views/draft, ux-compose.js, composer/recovery tests. Preserve send request idempotency and session-generation checks. Write regression cases before implementation; run targeted tests.
- [x] Task 4 — Integration and review: inspect available APIs before search/recovery UI additions, integrate locales and icon component consumers, run entire frontend tests and production build, review diff, inspect local fixture UI across themes/widths. Record any backend-dependent features explicitly instead of making fake local implementations.

Preflight: task 1 creates IconButton consumed by task 2/3 (agreed props above). Locale ownership separated; primary integrates all under ux. Task 1 global CSS and task 2 scoped CSS must agree on density classes; task 2 uses explicit container classes, removes conflicting Win95 viewport rules with a follow-up coordinated edit if needed. No plan task changes authentication, mail API ownership checks or send retry guarantees.

Progress and rulings:
- Existing behavior approval is the audit and user's request; no repeat design approval is needed.
- Existing working checkout retained on an isolated feature branch; audit screenshots are existing untracked artifacts and remain intact.
- Search/recycle restoration require verified server capabilities; unsupported functionality must not be falsely represented as implemented.
