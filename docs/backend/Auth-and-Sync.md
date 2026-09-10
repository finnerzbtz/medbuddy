# Reminduh accounts and cloud sync

Implemented 8 September 2026. This is an optional cloud account system for the existing offline app. Signing in uses a six-digit email code. Existing device records are uploaded only after the user chooses **Turn on cloud sync**. The app remains usable without an account.

## Deployed services

| Setting                  | Value                                  |
| ------------------------ | -------------------------------------- |
| Provider                 | Neon, managed Better Auth and Data API |
| Project                  | Reminduh (`damp-morning-93624758`)     |
| Region                   | AWS London (`aws-eu-west-2`)           |
| PostgreSQL               | 17                                     |
| Database                 | `reminduh`                             |
| Production branch        | `br-dawn-sea-zabc1mmp`                 |
| Development branch       | `br-late-brook-zaxr9z8w`               |
| Current recovery history | 24 hours                               |

Production and development have separate identities and data. The Vite development server uses development endpoints; production builds and Capacitor use production endpoints. Both branches have the checked-in migrations applied. No existing user medication records were migrated or uploaded during setup.

The shared beta email sender is Neon Auth (`auth@mail.myneon.app`). A branded sender and real inbox delivery still need verification. The app implements and tests real code verification; automated tests seed a synthetic development-only code instead of sending email. No email delivery claim is implied by those tests.

## User experience

Open **My Blobby → Account** or `/account`. Enter an email, then its code. No password or social login is required. A new account can enable sync for the current device. An existing account can restore its cloud copy, with record counts, an export option, and an explicit replacement confirmation when the device already has data.

Medication schedules, check-ins, profile, Blobby progress, earned leaves, outfits, room choices, and app preferences sync. OS notification permission, notification delivery receipts and snoozes stay on each device. Restoring onto another device leaves reminders off until that device enables them. Native StoreKit receipts and purchased-leaf ledger remain device-specific; this work does not make paid currency server-authoritative or activate real purchases.

Local edits save immediately while offline. Online changes are debounced; the active page also checks for remote changes on focus, reconnect, and every 30 seconds. The app cannot promise background sync when iOS suspends it. If two devices both change, sync pauses for review rather than silently losing check-ins. Users can export either copy before choosing the copy to keep. This first version resolves whole-account snapshots; it does not automatically merge conflicting records.

Sign-out removes that account's records and scheduled reminders from the device, preserving its cloud copy. Pending local changes must first be synced, exported or explicitly discarded. Deletion requires typing DELETE and verifying a fresh email code; it removes the identity and associated live cloud rows. Deleting an account that was never linked to the device preserves unrelated guest data. Historical recovery data may persist for the configured retention window.

## Access control and storage

`database/schema.ts` defines the account, medication and check-in tables with row-level security. Migrations under `database/migrations` also install three narrowly scoped RPCs: `reminduh_read`, `reminduh_save`, and `reminduh_delete_account`. The authenticated JWT determines ownership; callers cannot specify another user. A verified, unbanned, existing identity is required, including when an old JWT has not yet expired after deletion.

Direct client table access is revoked. Writes use a transaction, per-user advisory lock, and expected revision. Stale writes return a conflict snapshot. Check-in foreign keys, supported limits and basic structure are validated before committing. The deletion RPC requires a session token belonging to the same identity, created in the preceding ten minutes. Tokens are never written to application logs.

On the web, managed auth uses its secure HttpOnly session cookie. On iPhone, `ReminduhAuthPlugin` uses an ephemeral URLSession and stores that cookie in Keychain with `WhenUnlockedThisDeviceOnly`. Only the two configured auth hosts and the required auth routes are accepted; redirects are refused. Short-lived Data API JWTs stay in memory. Medication data is not sent in sign-in emails. Database owner credentials are used only by local migration and development test tools, never by the browser or native bundle.

The local account owner and snapshot metadata are written atomically with app data. Cross-tab scope checks prevent stale pages from saving one person's records into a different account. These controls are tested, but are not a legal compliance certification or substitute for a release privacy review.

## Configuration and development

Use Node 22 or newer. Public URLs go in the ignored `.env.development.local` and `.env.production.local` files:

```dotenv
VITE_NEON_AUTH_URL=https://<branch-auth-host>/reminduh/auth
VITE_NEON_DATA_URL=https://<branch-data-host>/reminduh/rest/v1
```

A build without both values runs without cloud accounts. Changing the production auth host also requires updating the native bridge allowlist. For a deployed website, add its exact HTTPS origin to that branch's auth trusted origins and test browser cookie behavior, particularly Safari. Local origins currently configured are `http://127.0.0.1:5177` for development and `http://127.0.0.1:4177` for preview.

Migration credentials belong in mode-0600, ignored `.env.backend.development.local` and `.env.backend.production.local` files, each containing a direct, TLS-verified `DATABASE_URL`. Do not use a pooler for migrations. Never prefix a secret with `VITE_`.

```sh
npm run db:generate
npm run db:migrate -- development
# Review and validate on development before applying the same migrations:
npm run db:migrate -- production
```

Make future schema changes in Drizzle, generate and review the SQL, and test on the development branch first. Handwritten RPC changes belong in versioned SQL migrations, not an unrecorded console edit. The managed `neon_auth` schema is provider-owned; the integration fixtures touch only their specifically named synthetic development accounts.

## Verification

With the development server available at port 5177 and development migration credentials configured:

```sh
npm run test:cloud
npm run test:unit
npm run test:ios-domain
npm run ios:simulator
```

Cloud tests are explicitly restricted to this project's development host. They create synthetic `example.invalid` users; browser code-send requests are intercepted to seed a test OTP hash, while actual code verification, session cookies, JWTs, account operations and Data API requests use the live backend. Never run fixtures against production. Private synthetic credentials and cookies are stored in ignored mode-0600 files under `rebuild/generated/qa-cloud/private`.

The latest completed checks are 16 live auth/database assertions, 14 browser flow checks (including mobile accessibility), 97 domain checks and 15 native reminder/domain checks. The iPhone simulator release build also passed for arm64 and x86_64. Xcode’s open project had a file-coordination stall, so verification used an isolated copy of its project metadata with the same source files. Reports and screenshots are under `rebuild/generated/qa-cloud`. Real inbox delivery and physical iPhone sign-in still require a manual check. The existing TestFlight 0.1.0 (1) predates this feature; a new archive/upload is required to distribute accounts to testers.

Before public release, finish branded email and delivery verification, update the published privacy policy and App Store privacy answers for optional cloud storage, and validate native sign-in, restore, sign-out and deletion on a physical iPhone. Do not enable paid-leaf purchases until their separate purchase validation and account-ledger design is complete.
