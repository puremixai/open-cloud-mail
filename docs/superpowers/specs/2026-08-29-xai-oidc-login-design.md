# XAI OIDC Login Design

## Goal

Add XAI Connect as a fourth login provider. XAI-authenticated users may create and bind a Cloud Mail account without a registration key, while ordinary registration and the other OAuth providers retain their existing registration-key policy.

## Callback contract

The registered callback is an exact HTTPS URL with this shape:

```text
https://<mail-web-domain>/api/oauth/xai/callback
```

`mail-worker/src/index.js` removes the external `/api` prefix before dispatching to Hono, so the new Hono route is `/oauth/xai/callback`. The web domain may differ from the managed email domain. The configured callback must have HTTPS, no credentials, query, or fragment, and its origin must equal the origin serving the login request.

## Administration and persistence

The system-settings OAuth card adds XAI fields for Client ID, Client Secret, exact callback URL, and enabled/disabled state. These values are persisted in D1 columns `xai_client_id`, `xai_client_secret`, `xai_redirect_uri`, and `xai_switch`.

The browser submits a newly entered Client Secret over HTTPS only. The Worker encrypts it with AES-256-GCM before writing D1. The encryption key is derived from `jwt_secret` with HKDF-SHA-256 and a purpose-specific context. Admin read APIs return only `xaiClientSecretConfigured`; they never return plaintext or ciphertext. Submitting an empty secret keeps the existing encrypted value. Rotating `jwt_secret` requires entering the XAI Client Secret again.

## OIDC flow

Use `openid-client` 6.8.7 for Discovery, Authorization Code, PKCE, state, nonce, ID Token validation, `client_secret_basic`, and UserInfo.

1. `GET /api/oauth/xai/start` checks that XAI is enabled and fully configured, validates the callback, discovers `https://connect.xai.run`, generates fresh PKCE/state/nonce values, saves them in D1, sets a Secure HttpOnly SameSite=Lax cookie containing only the opaque state, and redirects to XAI Connect.
2. Request only `openid profile community`. No email or offline access is needed because Cloud Mail asks the user to bind a local mailbox and does not retain XAI tokens.
3. `GET /api/oauth/xai/callback` rejects provider errors, missing/mismatched/expired state, and replayed sessions before token exchange. It reconstructs the externally registered callback URL, exchanges the code using `client_secret_basic`, and asks `openid-client` to validate issuer, audience, signature, expiry, state, nonce, and PKCE. It additionally rejects a missing/future `iat`.
4. Fetch UserInfo with the opaque access token and require the UserInfo `sub` to match the ID Token. Require `active === true` and `silenced !== true`. Use `sub` as `oauth_user_id`; username, name, picture, and trust level are display metadata only.
5. Store/update the provider-scoped OAuth identity, mark the D1 OAuth session verified, and redirect to `/login?oauth=xai`. Authorization codes and tokens never enter the SPA, URL, logs, or database.
6. `POST /api/oauth/xai/complete` reads the server-side verified session. An already-bound identity receives the existing Cloud Mail JWT; an unbound identity receives only sanitized profile data so the binding form can open.
7. `PUT /api/oauth/xai/bindUser` accepts the local email and optional registration-key field but derives the XAI identity exclusively from the verified server-side session. XAI registration bypasses the registration key. After login or binding, delete the session and cookie.

## Server-side session

Create `oauth_session` with an opaque random `state` primary key, platform, nonce, PKCE verifier, callback URL, status, verified OAuth subject, and integer expiry. A conditional D1 update moves `pending` to `exchanging`, preventing a callback replay from exchanging the same authorization code. Failed, completed, and expired sessions are deleted. Scheduled maintenance removes abandoned expired rows.

## Compatibility

Linux.do, GitHub, and Google keep their existing browser callback flow. OAuth identity lookup becomes provider-scoped so equal subject strings from different providers cannot overwrite each other. The public website configuration exposes only XAI's enabled switch; its Client ID, callback, and secret remain server-side.

## Verification

Unit tests cover encrypted-value tamper detection, callback validation, PKCE/state session transitions, XAI account-status policy, provider-scoped identities, secret masking, and registration-key exemption. The final checks run Worker unit tests, the Worker deployment dry-run/build, and the Vue production build.
