# Future work: student sign-in with university Microsoft accounts

Today a student joins with a join code and types their name and student ID.
This note describes how a future team can replace the typed fields with a
verified sign-in through the university's Microsoft account (Microsoft Entra
ID — Assumption University uses Microsoft 365), so every session belongs to a
verified university identity.

## Target flow

1. Student opens the popup and enters the **join code** (unchanged).
2. Popup → **"Sign in with your university account"** → Microsoft sign-in page.
3. The extension receives an **ID token** and sends it with
   `POST /exams/:code/register`.
4. The backend **verifies** the token and takes the identity from it:
   - email from `preferred_username` (or `upn`), e.g. `u6530338@au.edu`;
   - student ID = the digits of the email (`6530338`) — the same rule the
     Google Forms webhook already uses;
   - display name from `name`.
5. The typed name / ID fields disappear. One session per verified identity per
   exam; the form webhook's ID match becomes exact.

## What to set up

**App registration (Microsoft Entra admin center → App registrations):**
- **Single tenant** ("Accounts in this organizational directory only") in the
  **AU tenant** — this is what limits sign-in to AU students and staff.
- Platform: **Single-page application / public client** with redirect URI
  `https://<extension-id>.chromiumapp.org/` (the ID is fixed once the extension
  is published; `chrome.identity.getRedirectURL()` prints it).
- Scopes: `openid profile email` only (no Graph permissions needed). These are
  normally user-consentable; if AU's tenant requires admin consent, AU IT
  grants it once.
- Whether a student account may register apps depends on AU's tenant policy
  ("Users can register applications"); otherwise AU IT creates the registration.
- **No client secret / Key Vault is needed for this flow** — the extension is a
  public client using the authorization-code flow with **PKCE**. (Key Vault is
  only useful for the server's own secrets, e.g. the DB password and
  `JWT_SECRET`, and is optional.)

**Extension:**
- `manifest.json`: add the `identity` permission.
- Use `chrome.identity.launchWebAuthFlow` against
  `https://login.microsoftonline.com/<AU-tenant-id>/oauth2/v2.0/authorize`
  with `response_type=code`, PKCE `code_challenge`, `scope=openid profile email`,
  then exchange the code at `/oauth2/v2.0/token` (public client — no secret)
  to get the `id_token`.
- Send `{ idToken }` instead of `{ studentName, studentId }` when registering.

**Backend:**
- Verify the ID token with a JWKS library (e.g. `jose`):
  signature against `https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys`,
  `aud` = the app's client ID, `iss` = `https://login.microsoftonline.com/<tenant>/v2.0`,
  `tid` = AU tenant ID, `exp` not passed.
- Derive student ID / name from the claims; reject tokens from other tenants.
- Keep the existing duplicate-ID handling; with verified identities it only
  ever triggers for the same person on two devices.
- New env: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`.

**Optional:** the same app registration can later let **teachers** sign in to
the dashboard with Microsoft instead of admin-created passwords.

## Effort / dependencies

- Needs AU's tenant ID and an app registration in the AU tenant (possibly AU
  IT approval) — the main dependency, not the code.
- New extension version → Chrome Web Store review.
- Roughly: extension sign-in + backend token verification + popup UI changes;
  database unchanged (name and student ID still stored on the session).
