# First Bloom release candidate

Current build: **0.4.0-rc.4**

This hotfix addresses real-phone lag in the Mastery Grove selection screen. Mobile now uses a bounded canvas pixel budget and 24 FPS ambient scheduler, suspends decorative drawing during touch/scroll, hidden, modal, and active-game states, removes live mobile backdrop blur and animated grain, reduces paint-heavy effects, and skips offscreen card rendering. Desktop retains the full visual treatment. A dedicated performance contract prevents these budgets from regressing.

This candidate completes Lumenloom's portrait-mobile release pass and Garden Awakening spectacle. It adds relative thumb steering, independent WEAVE/RELEASE input, compact mobile copy, reachable responsive geometry, portrait orientation handling, and automatic profile forwarding from Mastery Grove. The garden now carries five distinct night atmospheres, shape-backed target guidance, layered luminous thread and knots, persistent capped awakening marks, closure bloom waves, a responsive Hollow Guardian, and staged dawn. Mastery Grove also quiets its game bar during active play while preserving a clear 44px return control. Desktop and mobile share the same gameplay rules, scoring, progression, results, saves, and Grove protocol.

This repository now produces a small, allowlisted web release containing Mastery Grove, Lumenloom, Bloomfold, Ripplewake, and Prismbind. Never distribute the workspace root; it also contains development videos, staging material, and unrelated Unity projects.

## Build and verify

Install Node.js 18 or newer, then run:

```text
node tools/release.mjs release
```

The command syntax-checks every product and tooling script, runs every discovered `*.test.js`, checks HTML/CSS local references and duplicate IDs, clears only the workspace `dist` folder, copies the runtime allowlist, and writes SHA-256 evidence for every payload file to `dist/release-manifest.json` (the manifest does not hash itself).

Publish or zip the **contents of `dist`**. Its stable public entrypoint is `dist/index.html`; the canonical game hub remains `dist/MasteryGrove/index.html`.

## Local play

Double-click **PLAY MASTERY GROVE.cmd**. It rebuilds the release and serves only `dist` at `http://127.0.0.1:4173/`, giving all four games one predictable browser storage origin. Keep its terminal window open while playing.

Equivalent commands:

```text
node tools/release.mjs build
node tools/static-server.mjs --open --port 4173
```

## Required review gates

This is a release candidate, not a legal or store-submission approval. Before public distribution:

- Replace the review placeholders in `PRIVACY.md` and `CREDITS.md` with owner-approved text.
- Confirm the final rights holder, contact route, platform privacy behavior, and any SDK disclosures.
- Perform an uncoached full-progression playtest from a clean profile on desktop and physical iPhone/Android hardware.
- Validate the exact `dist` upload on the chosen portal, host, or mobile wrapper.
- Produce platform-specific PNG icons, screenshots, signing credentials, and store metadata where required.
