# AI note

How I used AI on this assignment. Back to the [README](README.md).

## What I used it for

I used AI (Claude Code) throughout, including to write of the code and the tests.

- **Spec:** AI turned the PDF into a requirements reference, [`docs/spec.md`](docs/spec.md), with a table mapping each requirement to the code and tests that cover it.
- **Code and tests:** AI supported me in writing the implementation of the backend and the test cases from that spec. It also ran an edge-case script (bad input, spoofed fields, simultaneous requests) and a browser click-through.
- **Review:** I had AI review the project in a fresh session, given the code, the spec and the PDF, and asked for numbered issues ranked by priority with the PDF quote behind each one. It found a real gap (a failed KYC review could not be recorded without moving the stage) and several smaller ones. I decided which findings to fix and which to leave.

## How correctness was checked

- The PDF is the source of truth. The reviewer was told that where the spec and the PDF disagree, the PDF wins, because the spec was also written by AI and could share a mistake with the code.
- Every requirement is mapped to code and a test in the table in `docs/spec.md`.
- Behaviour was run, not only read: the automated tests, the edge-case script, and a manual pass in a browser.
- I have re-read through what to build, the requirement, scope of the project, and compare it to the specs that Claude generated, i am to confirm that what to build, the requirements and scope matches with what claude propose in the specs.

## Limits

- AI output is a draft, not a source of truth.
- The frontend has no automated tests, only the manual browser pass.
- Decisions where the PDF is silent (one step at a time, how a failed KYC review is handled, and so on) are listed under Assumptions in the README.

## Prompts

The prompts behind each step. Spec and review are the prompts as run. For code and tests, the first block is what I originally typed (lightly cleaned of typos) and the second is a polished version of the same intent that I would use now.

### 1. Spec generation (as run)

```
/superpowers:brainstorming Read the PDF "Home Assignment_ Vendor Onboarding Tracker.pdf"
thoroughly. Produce a reference spec (docs/spec.md) that highlights: the business
problem, the 5-stage workflow, key features, must-have requirements, explicit
out-of-scope items, evaluation criteria, submission deliverables, ambiguities with
the assumption chosen for each, and a traceability table mapping every requirement
to the existing code and tests in this repo. The app is already built, so this is a
requirements/reference spec, not a new build.
```
### 2. Code implementation
```
Build the Vendor Onboarding Tracker described in docs/spec.md.
Stack: plain JavaScript, Node + Express, built-in SQLite (node:sqlite), and a plain
HTML/JS frontend with no framework and no build step.
Optimise for a small codebase I can read and explain end to end.
```

### 3. Testing
```
Write tests for the Vendor Onboarding Tracker. For each test, say in one line why it
exists. Cover:
- the business rules: the "stuck" boundary (exactly the limit vs one day over), Active
  never stuck, allowed and disallowed stage moves
- history: every change records who, when, previous stage and new stage; rejected
  changes write nothing
- concurrency: two coordinators change the same vendor, and only one succeeds
- security: unauthenticated calls are rejected, and the recorded user comes from the
  login, not the request body
- bad input: wrong types, missing fields, oversized notes, malformed JSON, unknown ids
Keep the clock injectable so tests do not wait for real days. Then run the whole
suite and an end-to-end check in a real browser, and report anything that fails.
```

### 4. Review (as run)

```
Review this project against the PDF first, the spec second, the code third.
Where spec and PDF disagree, the PDF wins and that is a finding.
Return numbered issues ranked P0 (breaks a stated requirement), P1 (wrong or risky
behavior, or a deliverable gap), P2 (clarity, polish). Each issue: PDF quote,
file:line, what is wrong, suggested fix, and whether it was verified or not.
Also report what is missing, not only what is wrong. Do not change code.
```

I ran this in a fresh session with read-only access, so the reviewer did not share the context that wrote the code.
