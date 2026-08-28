# XAI OIDC Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side XAI Connect OIDC login and allow verified XAI users to register or bind without a registration key.

**Architecture:** The Worker uses `openid-client` for Discovery and Authorization Code + PKCE. D1 stores encrypted XAI configuration and short-lived OAuth transactions; the Vue SPA starts the flow and completes/binds it without ever receiving XAI codes or tokens.

**Tech Stack:** Cloudflare Workers, Hono, D1, Drizzle ORM, Web Crypto AES-GCM/HKDF, openid-client 6.8.7, Vue 3, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-xai-oidc-login-design.md`

## Global Constraints

- External callback is exactly `https://<mail-web-domain>/api/oauth/xai/callback`; Hono registers `/oauth/xai/callback`.
- Store the Client Secret encrypted in D1 and never return plaintext or ciphertext to a browser.
- Store state, nonce, and PKCE verifier in a short-lived server-side D1 session.
- Request only `openid profile community`; do not persist XAI authorization codes or tokens.
- Only `active === true` and `silenced !== true` identities may establish a Cloud Mail session.
- XAI registration bypasses registration keys; ordinary, GitHub, and Google registration policy does not change.
- Do not commit or push without an explicit user request.

---

### Task 1: Security and protocol primitives

**Files:**
- Create: `mail-worker/test/sealed-value.spec.js`
- Create: `mail-worker/test/xai-oidc-policy.spec.js`
- Create: `mail-worker/src/utils/sealed-value.js`
- Create: `mail-worker/src/service/xai-oidc-policy.js`
- Modify: `mail-worker/package.json`
- Modify: `mail-worker/pnpm-lock.yaml`

**Interfaces:**
- Produces: `sealValue(secret, purpose, plaintext)` and `openValue(secret, purpose, sealed)`.
- Produces: `validateXaiRedirectUri(value, requestOrigin)`, `validateXaiClaims(claims, userInfo, nowSeconds)`, and `normalizeXaiUser(userInfo)`.
- Adds `openid-client` version `^6.8.7`.

- [ ] **Step 1: Write failing encryption tests**

Test a literal plaintext round trip, a one-byte ciphertext mutation, and opening with the wrong purpose. The production change that makes these fail is missing authenticated encryption or missing purpose separation.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm test:unit -- test/sealed-value.spec.js`

Expected: FAIL because `src/utils/sealed-value.js` does not exist.

- [ ] **Step 3: Implement authenticated encrypted values**

Use HKDF-SHA-256 over `jwt_secret` with salt `cloud-mail-sealed-value-v1`, derive a non-exportable AES-GCM 256-bit key using the caller-provided purpose as HKDF info, generate a 12-byte IV, and emit `v1.<base64url(iv)>.<base64url(ciphertext)>`. Reject malformed versions and failed authentication with a `BizError` that contains no sealed input.

- [ ] **Step 4: Verify encryption GREEN**

Run: `pnpm test:unit -- test/sealed-value.spec.js`

Expected: PASS with three tests.

- [ ] **Step 5: Write failing callback and account-policy tests**

Use hand-written HTTPS and invalid URL fixtures. Assert that only `/api/oauth/xai/callback` on the current request origin is accepted, and that missing query/fragment/userinfo activity rules are enforced. Assert normalized output uses literal `sub`, `preferred_username`, `name`, `picture`, and `trust_level` values.

- [ ] **Step 6: Run the policy tests and verify RED**

Run: `pnpm test:unit -- test/xai-oidc-policy.spec.js`

Expected: FAIL because `src/service/xai-oidc-policy.js` does not exist.

- [ ] **Step 7: Implement policy helpers and install the OIDC client**

Implement the three exported helpers. `validateXaiClaims` requires matching non-empty subjects, numeric `iat <= now + 60`, `active === true`, and `silenced !== true`. Run `pnpm add openid-client@^6.8.7` in `mail-worker`.

- [ ] **Step 8: Verify Task 1 GREEN**

Run: `pnpm test:unit -- test/sealed-value.spec.js test/xai-oidc-policy.spec.js`

Expected: PASS with no warnings.

### Task 2: D1 configuration and OAuth sessions

**Files:**
- Create: `mail-worker/test/xai-setting.spec.js`
- Create: `mail-worker/test/xai-session.spec.js`
- Create: `mail-worker/src/entity/oauth-session.js`
- Create: `mail-worker/src/service/oauth-session-service.js`
- Modify: `mail-worker/src/entity/setting.js`
- Modify: `mail-worker/src/init/init.js`
- Modify: `mail-worker/src/service/setting-service.js`

**Interfaces:**
- Produces setting fields `xaiClientId`, `xaiClientSecret`, `xaiRedirectUri`, `xaiSwitch`, and response-only `xaiClientSecretConfigured`.
- Produces `oauthSessionService.create`, `claim`, `markVerified`, `getVerified`, `delete`, and `clearExpired`.

- [ ] **Step 1: Write failing setting tests**

Exercise `settingService.prepareUpdate(c, current, params)` with a real `sealValue`: a non-empty secret becomes a `v1.` value that decrypts to the literal input, an empty secret is omitted so the old value survives, and `settingService.sanitizeForAdmin(row)` removes the stored value while returning `xaiClientSecretConfigured: true`.

- [ ] **Step 2: Run setting tests and verify RED**

Run: `pnpm test:unit -- test/xai-setting.spec.js`

Expected: FAIL because the preparation and sanitization interfaces are absent.

- [ ] **Step 3: Implement schema, migration, and safe settings persistence**

Add the four setting columns to Drizzle and `v3_4DB`. Add `oauth_session` and an expiry index in the same migration. Clone cached settings before masking; never expose `xaiClientSecret` from admin or website configuration. On update, encrypt only a non-empty submitted secret and retain the existing encrypted value otherwise.

- [ ] **Step 4: Verify setting tests GREEN**

Run: `pnpm test:unit -- test/xai-setting.spec.js`

Expected: PASS.

- [ ] **Step 5: Write failing session-state tests**

Use a deterministic in-memory repository implementing the service's repository interface. Assert `pending -> exchanging -> verified`, a second claim fails, expired sessions fail, and completion deletes the row.

- [ ] **Step 6: Run session tests and verify RED**

Run: `pnpm test:unit -- test/xai-session.spec.js`

Expected: FAIL because `oauth-session-service.js` does not exist.

- [ ] **Step 7: Implement D1 session lifecycle**

Back the service with Drizzle by default and permit a repository argument for deterministic unit tests. Generate 192-bit state, nonce, and 256-bit PKCE verifier values through `openid-client`; use conditional update predicates on state, status, and expiry so only one callback can claim a pending session.

- [ ] **Step 8: Verify Task 2 GREEN**

Run: `pnpm test:unit -- test/xai-setting.spec.js test/xai-session.spec.js`

Expected: PASS.

### Task 3: XAI OIDC Worker endpoints and registration exemption

**Files:**
- Create: `mail-worker/test/xai-oauth-service.spec.js`
- Modify: `mail-worker/test/registration-key-policy.spec.js`
- Create: `mail-worker/src/service/xai-oauth-service.js`
- Modify: `mail-worker/src/service/oauth-service.js`
- Modify: `mail-worker/src/service/login-service.js`
- Modify: `mail-worker/src/api/oauth-api.js`
- Modify: `mail-worker/src/index.js`

**Interfaces:**
- Produces `GET /oauth/xai/start`, `GET /oauth/xai/callback`, `POST /oauth/xai/complete`, and `PUT /oauth/xai/bindUser`.
- Produces provider-scoped `oauthService.getById(c, oauthUserId, platform)` and provider-scoped updates.

- [ ] **Step 1: Extend registration tests and verify RED**

Add literal cases proving XAI bypasses a required key and GitHub still does not. Add a provider-collision case proving `sub = same-id` for XAI cannot select a Linux.do record.

Run: `pnpm test:unit -- test/registration-key-policy.spec.js`

Expected: FAIL on the XAI exemption and provider-scoping assertions.

- [ ] **Step 2: Implement minimal registration and identity scoping**

Treat `linuxdo` and `xai` as the only verified exemption platforms. Make OAuth reads and updates include `platform` whenever known; XAI binding never accepts its subject from the request body.

- [ ] **Step 3: Verify registration tests GREEN**

Run: `pnpm test:unit -- test/registration-key-policy.spec.js`

Expected: PASS.

- [ ] **Step 4: Write failing service-flow tests**

Inject an OIDC adapter and session repository at external boundaries. Assert start persists state/nonce/verifier and builds `openid profile community` with S256; callback supplies the exact configured `/api` callback to `authorizationCodeGrant`, expected state/nonce/verifier, rejects inactive users, stores only normalized profile data, and never returns the provider access token.

- [ ] **Step 5: Run service tests and verify RED**

Run: `pnpm test:unit -- test/xai-oauth-service.spec.js`

Expected: FAIL because `xai-oauth-service.js` does not exist.

- [ ] **Step 6: Implement the server-side OIDC flow**

Use `openid-client.discovery(new URL('https://connect.xai.run'), clientId, { client_secret: secret }, ClientSecretBasic(secret))`, `buildAuthorizationUrl`, `authorizationCodeGrant`, and `fetchUserInfo`. Reconstruct the callback URL from the configured external callback plus the incoming query. Store only the verified subject/profile and local session status. Use a Secure HttpOnly SameSite=Lax cookie scoped to `/api/oauth/xai`; redirect success to `/login?oauth=xai` and failures to `/login?oauth=xai&error=<non-sensitive-code>`.

- [ ] **Step 7: Register endpoints and preserve external `/api` dispatch**

Add the four Hono routes. Export the path-rewrite helper from `src/index.js` so a unit test can prove `/api/oauth/xai/callback` becomes `/oauth/xai/callback` without changing all other Worker dispatch behavior.

- [ ] **Step 8: Verify Task 3 GREEN**

Run: `pnpm test:unit -- test/registration-key-policy.spec.js test/xai-oauth-service.spec.js`

Expected: PASS.

### Task 4: Admin and login UI

**Files:**
- Modify: `mail-vue/src/views/sys-setting/index.vue`
- Modify: `mail-vue/src/views/login/index.vue`
- Modify: `mail-vue/src/request/ouath.js`
- Modify: `mail-vue/src/utils/verify-utils.js`
- Modify: `mail-worker/test/registration-key-policy.spec.js`

**Interfaces:**
- Produces frontend requests `oauthXaiComplete()` and `oauthXaiBindUser(form)`.
- Produces an XAI settings card with callback and one-way secret entry.

- [ ] **Step 1: Extend the frontend policy test and verify RED**

Assert `getRegistrationKeyPolicy(0, 'xai')` returns `{ visible: false, required: false }` while GitHub remains required.

Run: `pnpm test:unit -- test/registration-key-policy.spec.js`

Expected: FAIL on the XAI literal.

- [ ] **Step 2: Implement the UI policy and request functions**

Add XAI to the exempt set, add complete/bind request functions, and keep the existing request functions unchanged.

- [ ] **Step 3: Add admin XAI configuration**

Add an XAI OAuth card. For XAI only, show an exact callback input defaulting to `${window.location.origin}/api/oauth/xai/callback`; show the secret input empty with an `已配置，留空不修改` placeholder when configured; submit callback plus non-empty secret only.

- [ ] **Step 4: Add the XAI login and completion flow**

Clicking XAI navigates to `/api/oauth/xai/start`. On `/login?oauth=xai`, remove the query from browser history, call complete, save a returned local JWT, or open the existing email binding dialog with platform `xai`. XAI binding sends only email and code to its dedicated endpoint.

- [ ] **Step 5: Verify Task 4 GREEN**

Run: `pnpm test:unit -- test/registration-key-policy.spec.js`

Run in `mail-vue`: `pnpm build`

Expected: unit tests PASS and Vite exits 0.

### Task 5: Full verification and handoff

**Files:**
- Review all files listed above.

**Interfaces:**
- Consumes every preceding task; produces verification evidence only.

- [ ] **Step 1: Run all Worker unit tests**

Run in `mail-worker`: `pnpm test:unit`

Expected: all suites and tests PASS with exit code 0.

- [ ] **Step 2: Bundle the Worker without deploying**

Run in `mail-worker`: `pnpm exec wrangler deploy --dry-run --outdir .wrangler-dry-run-xai`

Expected: Worker bundle succeeds with exit code 0 and contains no Node compatibility errors from `openid-client`.

- [ ] **Step 3: Build the production SPA**

Run in `mail-vue`: `pnpm build`

Expected: Vite exits 0.

- [ ] **Step 4: Inspect the exact diff and repository state**

Run: `git diff --check`, `git status --short`, and `git diff --stat`.

Expected: no whitespace errors, only XAI feature/plan files changed, and no commit or push performed.

- [ ] **Step 5: Report deployment actions**

Tell the user to deploy, invoke the existing `/api/init/<jwt_secret>` migration endpoint once, configure `https://<web-domain>/api/oauth/xai/callback` in XAI Connect and the same value in Cloud Mail, then enable XAI after entering Client ID and Client Secret.
