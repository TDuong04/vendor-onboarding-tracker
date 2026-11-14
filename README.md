# Vendor Onboarding Tracker

Small web app that replaces the onboarding spreadsheet. Coordinators log in, see every vendor's stage, move vendors along the 5 stages, read the history, and see which vendors are stuck.

## Run it

Needs Node 22.13 or newer.

```
cd backend
npm install
npm start        # http://localhost:3000
npm test
```

Log in as `Linh`, `Huy` or `Mai`. Password for all: `password`.
Data lives in memory and is re-seeded on every start. Seed dates are "N days ago", so the demo always has some stuck vendors.

## Problems I saw in the spreadsheet

1. **Stuck vendors are invisible.** Nothing compares "Last Updated" to today, so a vendor can sit at a stage for weeks. The app computes days in stage itself and flags vendors past 7 days.
2. **No audit trail.** When a row looks wrong, nobody can tell who changed it, when, or from what. Every stage change is now stored as a history row (who, when, from, to, optional note).
3. **Manual, easy-to-get-wrong data.** "Last Updated" is typed by hand and the stage is free text. Three people edit the same sheet at once and can overwrite each other silently. Now the date comes from the system clock, stages are a fixed list with allowed moves, and a stale edit is rejected.

## Approach

Two tables:
- `vendors`: name, region, coordinator.
- `stage_changes`: one row per stage the vendor has entered. **The newest row is the current stage.**

The stage is not stored on the vendor. The history is the only source of truth, so the stage and the history can never disagree, and "days in stage" is just now minus the newest row's time. No manual date.

Code layout (each file has one job):

| File | Job |
|---|---|
| `backend/src/stages.js` | Workflow rules and stuck logic. Pure functions, no DB, no clock. |
| `backend/src/db.js` | Schema and seed data. |
| `backend/src/vendors.js` | List vendors, read history, change a stage. |
| `backend/src/server.js` | Login and 4 endpoints (list, history, change stage, log note). Thin. |
| `frontend/` | Plain HTML + JS, no framework. Served by the backend. |
| `backend/test/` | Tests. |

## Decisions

- **Plain JS + Express + built-in SQLite (`node:sqlite`).** One runtime, one dependency, no build step, no native install. Easy to read end to end.
- **"Who" comes from the login, never from the request body.** A coordinator cannot record a change as someone else (there is a test for it).
- **Stale-update check.** The browser sends the stage it was looking at. If the vendor has moved since, the server answers 409 and the UI reloads. This covers the "3 coordinators at once" case. The check and the write share one transaction (`BEGIN IMMEDIATE`).
- **The clock is a parameter** (`now`), so tests freeze time instead of waiting for days.
- **Errors are one small class (`AppError`)** carrying an HTTP status. One handler turns it into a response.

## Domain note: KYC

I did not know what "KYC" meant when I started. I looked it up: it stands for "Know Your Customer", the identity and legitimacy check a company runs on a new customer or partner before doing business with them. From that I inferred how it fits this workflow: the vendor sends documents, Compliance reviews them, and the vendor cannot go Active until the review passes. That inference is why the app does not allow skipping straight to Active, and why a failed review leaves the vendor at "KYC Docs Received" instead of moving it. I have not seen Shopee's real compliance process, so details beyond what the PDF says are my reading of it.

## Assumptions

- A move is **one step forward or one step back**. The PDF only says "move to a different stage", so this is deliberately stricter. The trade-off: a vendor that is two stages off needs two moves, but nobody can jump to Active without passing KYC, and every correction is visible in the history. If Ops wanted free-form moves it is a one-function change (`isMoveAllowed`). Going back exists to fix mistakes; the history keeps the record.
- A failed KYC review is **not a stage change**: the vendor stays at "KYC Docs Received" and the coordinator uses **Log note** to record it (e.g. "asked vendor to resend license"). The note is saved as a history row with the same stage before and after, so who/when is kept. Logging a note does **not** restart the days-in-stage count, because the vendor has not progressed. (The compliance review itself is out of scope.)
- The vendor list shows the **latest note** and who wrote it, even if later stage moves had no note. The full list is in History.
- **Stuck = strictly more than 7 days** in the current stage. Exactly 7 is not stuck. **Active is never stuck.**
- Any logged-in coordinator can move any vendor. The "Coordinator" column shows who owns the vendor but does not restrict anything.
- Days are whole days measured in UTC timestamps.

## Shortcuts because of the time limit

- Passwords are one shared demo value, tokens live in server memory (lost on restart).
- In-memory database: nothing survives a restart. `openDb('file.db')` already supports a file, it is just not wired to a flag.
- No pagination, filtering or sorting in the vendor table.
- UI is minimal and has no browser tests; the logic is tested at the module and API level instead.
- `node:sqlite` is marked experimental by Node and prints a warning.

## What I tested and why

- `backend/test/stages.test.js`: the rules. Boundary of "stuck" (7 vs 8 days), Active never stuck, skipped/same/unknown moves. These are the business rules most likely to be wrong by one.
- `backend/test/vendors.test.js`: history is written correctly (who/when/from/to), a stage change restarts the stuck clock but a note-only entry does not, rejected moves write nothing, stale updates are rejected, missing `expectedStage` is a 400.
- `backend/test/api.test.js`: endpoints need login, and the recorded user comes from the login.

## Next, if I had more time

1. Persist to a SQLite file and add a real login (hashed passwords, expiring sessions).
2. Filters: "only stuck", by coordinator, by region. Sort by days in stage.
3. Per-stage stuck limits (KYC review probably deserves a different limit than contract signing) and a "why was this moved back" requirement.
4. Browser tests for the UI.
