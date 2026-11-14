# Vendor Onboarding Tracker: Requirements Reference

How AI was used: see [`AI-NOTE.md`](../AI-NOTE.md).

Source: `Home Assignment_ Vendor Onboarding Tracker.pdf` (7 pages). This file restates the PDF, records decisions where the PDF is silent, and maps every requirement to code and tests. If this file and the PDF disagree, the PDF wins.

## 1. Business problem

An Ops team onboards new vendors before they can operate in a region. They track it in a shared spreadsheet (columns: Vendor, Region, Stage, Last Updated, Coordinator, Notes). Three Ops Coordinators edit it during the day. As vendor count grows:

- Vendors can stay at one stage for a long time and nobody notices.
- When a row looks wrong, it is hard to understand what happened.
- "Last Updated" is typed by hand.

The PDF asks for 2-3 problems of your own in the write-up. Ours: stuck vendors are invisible, there is no audit trail, and manual dates plus simultaneous edits make the data unreliable.

## 2. The workflow (5 stages)

| # | Stage | Who / what happens |
|---|---|---|
| 1 | Contract Sent | Sales PIC signs vendor, adds the row |
| 2 | Contract Signed | Ops Coordinator follows up until signed |
| 3 | KYC Docs Received | Vendor emails KYC docs (business license, ID) |
| 4 | KYC Verified | Compliance reviews outside the sheet (Slack). Pass: coordinator moves to Verified. **Fail: vendor resends docs and stays at KYC Docs Received** |
| 5 | Active | Coordinator does final activation in another internal system, then marks Active |

## 3. Must-have requirements

1. **Login.** A coordinator logs in before using the app. Mock or seeded users are fine. The app must know who is using it. Out of scope: registration, password reset, user admin.
2. **View vendors.** List vendors with current stage and enough information to understand status. A handful of seeded vendors is fine. No create/delete.
3. **Update a vendor's stage.** A logged-in coordinator can move a vendor to a different stage. The app records automatically: **who**, **when**, **previous stage**, **new stage**. Coordinators have a reasonable way to view this history.
4. **Identify stuck vendors.** Highlight vendors that stayed in their current stage longer than a defined number of days (example: 7). The app computes time-in-stage itself; the coordinator does not type a "Last Updated" date. The threshold and the current date/time may be hardcoded.

## 4. Explicitly out of scope

Vendor creation or deletion, user registration or account management, production-grade authentication, email integration, the Compliance review system, the vendor activation system, notifications or reminders, real-time updates, production deployment infrastructure.

Also not required: polished UI, a coverage percentage, finishing everything in 3 hours, reproducing the example spreadsheet exactly, implementing "what if scale changed" scenarios (may be discussed in the interview).

## 5. Submission deliverables

1. Working solution in a GitHub or GitLab repository.
2. Short write-up (README or a few paragraphs): main problems, approach, technical decisions, assumptions, shortcuts/trade-offs, what to improve with more time. If unfinished: what is done, what remains, what next.
3. Tests, with focus on what was chosen to be tested and why.

Time budget: about 3 hours.

## 6. How it will be evaluated

Whether it works correctly, whether the business problem was understood, code clarity and structure, how the workflow and history are modeled, basic edge cases, and the ability to explain decisions and trade-offs. The solution becomes the starting point for a technical discussion.

## 7. Ambiguities and the assumption chosen

| PDF is unclear on | Our assumption | Where |
|---|---|---|
| Can a vendor skip stages or go backward? | One step forward or one step back only. No skipping, so nobody reaches Active without KYC. Back is for fixing mistakes; history keeps the record | `isMoveAllowed` |
| What does a failed KYC review look like in the app? | Not a stage change. Vendor stays at KYC Docs Received; coordinator uses Log note. It is a history row with the same stage before and after, and does not restart the days-in-stage count | `addNote` |
| When is a vendor "stuck"? | Strictly more than 7 days in the current stage. Exactly 7 is not stuck | `isStuck` |
| Can Active be stuck? | No, it is the end of the workflow | `isStuck` |
| Who may move a vendor? | Any logged-in coordinator. The Coordinator column is informational | `server.js` |
| Two coordinators edit at once | Second one is rejected with a conflict message, not silently overwritten | `changeStage` (409) |
| Where does "who" come from? | Always the login, never the request body | `server.js` |
| What is "now"? | Real clock, passed in as a parameter so tests can freeze it. Seed data uses "N days ago" | `getNow` / `seed` |
| Persistence | In-memory database, re-seeded on start | `openDb` |

## 8. Traceability: requirement to code to test

| Requirement | Code | Automated test | Manual check |
|---|---|---|---|
| Login, app knows the user | `backend/src/server.js` (`/api/login`, session map, auth middleware) | `api.test.js`: needs login | Browser: wrong and right password, logout |
| Reject unauthenticated calls | `server.js` auth middleware | `api.test.js` | Edge script: missing and garbage tokens |
| View vendors and stages | `listVendors` in `vendors.js`, `frontend/app.js` | `vendors.test.js`: seeded vendors show stage and days | Browser list |
| Log a note without moving the stage (failed KYC) | `addNote`, `POST /api/vendors/:id/note`, Log note button | `vendors.test.js`: note keeps stage and does not restart the clock; `api.test.js`: POST note | Browser: Company B stayed 12 days and stuck |
| Record who/when/prev/new on change | `changeStage` in `vendors.js`, `stage_changes` table in `db.js` | `vendors.test.js`: records who, when, from and to | Browser history list |
| "Who" cannot be spoofed | `server.js` passes `req.user` | `api.test.js`: user comes from the login | Edge script: spoofed body fields ignored |
| View history | `getHistory`, History button in `app.js` | `vendors.test.js`: history keeps every change, newest first | Browser |
| Stuck computed, not typed | `daysInStage`, `isStuck` in `stages.js` | `stages.test.js`: 7 vs 8 days, Active never stuck | Browser: red rows and badge |
| Stuck clock restarts on change | newest history row = current stage | `vendors.test.js`: restarts the stuck clock | Browser |
| Threshold hardcoded | `STUCK_AFTER_DAYS` in `stages.js` | `stages.test.js` | n/a |
| Allowed moves | `isMoveAllowed` | `stages.test.js`: forward/back, skip, same, unknown | Edge script |
| Edge: stale concurrent update | `changeStage` (expectedStage check, transaction) | `vendors.test.js`: stale update rejected | Browser with two sessions; 10 parallel requests gave 1 success |
| Edge: bad input | `AppError`, note validation, JSON error handler | `vendors.test.js`: bad notes; `api.test.js`: invalid JSON | Edge script (51 checks) |
| Write-up | `README.md` | n/a | n/a |
| Repository | GitHub, currently private | n/a | Make public or invite the reviewer before submitting |

Known gap: the frontend has no automated tests. UI behavior was verified by hand in a browser.

## 9. Open items before submitting

- Add a sentence to `AI-NOTE.md` on what you checked yourself (for example, re-reading the PDF against this spec).
- Re-read the PDF against this spec and note anything this spec got wrong.
- Push the latest commit; make the repo public or invite the reviewer.
