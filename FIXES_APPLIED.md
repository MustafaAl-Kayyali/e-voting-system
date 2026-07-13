# Fixes Applied

## Backend

- Made Redis optional. The API now runs in local single-node mode unless both `DISTRIBUTED_VOTING=true` and `REDIS_URL` are configured.
- Updated Redis helper logic so an accidentally present Redis URL does not enable distributed mode unless explicitly requested.
- Added a MongoDB connection timeout setting through `MONGO_SERVER_SELECTION_TIMEOUT_MS`.
- Improved election district eligibility checks to avoid crashes when district values are missing and to compare districts safely after trimming/lowercasing.
- Fixed a 2FA voting security issue: if a voter has 2FA enabled, a valid `twoFactorToken` is now required. The backend no longer trusts only `authenticationMethod: "2fa"`.
- Added `electoralDistrict` to voter signup/login responses so the voter dashboard can explain district mismatches.
- Added `npm run fix:districts` to repair existing election/candidate districts when old data uses `Main Office` but the voter uses another district.

## Frontend

- Fixed Admin Dashboard lint/runtime issue caused by `loadAuditLogs` not existing.
- Fixed Admin Dashboard tab loading so data is loaded by tab state instead of duplicate click handlers.
- Fixed lint errors in Voter Dashboard by reusing the existing loader functions.
- Added password autocomplete attributes to remove browser warnings.
- Improved the empty voter dashboard message to explain that voter district must match election district.
- Changed the Create Election district placeholder from only `Main Office` to examples that make district matching clearer.

## Validation

- Frontend lint: passed.
- Frontend production build: passed.
- Backend unit tests: 12 passed, 0 failed.

## Important existing-data fix

Your voter `Xavi Hernandez` has:

```js
electoralDistrict: "Barcelona"
```

Your election currently has:

```js
electoralDistricts: [{ name: "Main Office" }]
```

That is why the election does not appear for Xavi.

Run this from `backend/` after setting `.env` correctly:

```bash
npm run fix:districts -- Barcelona "Barcelona Presidental Elections"
```

This updates the matched election district and its linked candidates to `Barcelona`.
