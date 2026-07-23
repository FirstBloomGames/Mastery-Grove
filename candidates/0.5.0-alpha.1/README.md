# First Bloom Living Arcade validation candidate

Current build: **0.5.0-alpha.1**

This is the **D-029 Living Arcade technical validation alpha**. It is not approved as the public default: physical iPhone, Android, and shared-iPad passes plus ten unfamiliar-player sessions must complete before D029-O can choose Expand, Repair, or Stop.

First Bloom now opens into a ten-position Living Carousel with two clear phone rail pages. Lumenloom, Bloomfold, and Ripplewake are awake from the beginning; Prismbind and Mothchorus retain their canonical gates; Trees 06-10 remain honest noninteractive seeds without invented games or promises.

Lumenloom now shares one frozen parent/child rules module across Night Garden, Petal Rush, Shifting Constellation, and Hollow Rush. Wild adds rotating three-, four-, and five-flower targets; Crown enters the Guardian arena for three seals. Exact proof recomputation, timer ordering, threat floors, mode unlocks, remembered selection, and Trial-forced Standard are regression-protected.

The Grove adds optional, focus-safe Help and Lantern Willow Journal panels, progression-safe First Bloom replay, bounded announcements, and result-only unload warnings. Protocol-v2 saves remain parent-owned and exact-once; all protocol-v1 games retain launch, result, Return, and focus compatibility.

This candidate makes every saved run visibly feed its own tree in the **Living Carousel**. Score transfer starts only after verified persistence, selects the returning tree, lands on the exact lifetime total within 2.5 seconds, and can be skipped immediately by Retry, Play, or tree selection. Lumenloom grows continuously within each stage; Trees 02–05 use deterministic stage forms; Full Bloom continues into uncapped, truthfully labeled Everbloom rings with six bounded visual tiers. Routine result modals are retired, rare milestone ceremonies remain, and phone/reduced-motion paths use fixed pools and explicit rendering caps.

After First Bloom, Petal Rush is the remembered Lumenloom default: an immediate 90-second score attack with 11 replenished flowers, three petals, 100 Lumen, a 3.2-second fray window, deterministic threat replacement, exact capped proof/scoring, and parent-owned protocol-v2 Restart and Grove actions. Trial continues to force Standard without overwriting the player’s Petal selection. Standard Night Garden, canonical Mastery Seeds, profile migration, storage recovery, and all four existing protocol-v1 games remain regression-protected.

This candidate integrates **Mothchorus** as Tree 05 and the first advanced discipline of the Second Grove. The Choir Linden is visible but locked until the player defeats Prismbind and permanently awakens the Crownheart. Once unlocked, Solo and Together runs share the same rules, score ceiling, Best lane, Tree Total, growth, and Choir Seed proof. Profile v5 strictly migrates existing rc.7 progress in place, and the parent Grove validates every Mothchorus run lifecycle and result before applying it exactly once.

The Choir Seed requires one completed chorus scoring at least 6,500 with at least 18 of 24 voices returned. The Seed remains independent of the three foundational Seeds and does not alter the First Grove Trial. The Choir Linden grows cumulatively at 6,500, 18,000, 36,000, 65,000, and 100,000 Tree Total. The same candidate also includes D-027 Thread Mercy: Lumenloom enemies require 2.5 seconds of continuous thread contact to fray a segment, extended to 2.9 seconds by Golden Fiber.

This candidate makes the Mastery Grove itself answer the player without restoring continuous visual cost. Every tree now responds immediately to selection, exposes its next growth and skill reward, remembers completed trees for the current visit, and receives accepted scores through a save-first return ceremony with an exact total count-up. Strict personal bests, matched bests, and runs within 90% of the prior lane best receive honest outcome language. Completing all three foundational games in one visit awakens one decorative Grove Harmony. Four short locally synthesized tree voices are optional through a dedicated Grove sound control; reduced motion resolves the same information without score travel or motes. All new effects are discrete, capped, dependency-free, and return to rest.

This hotfix guarantees a visible route back to the Grove from every embedded game. Grove-hosted games no longer expose child-only fullscreen, and the parent iframe no longer grants fullscreen permission that could cover the persistent Return rail. The Grove header now owns an isolated, clipped grid row above the iframe. Standalone and portal builds retain their own fullscreen capability.

This hotfix addresses real-phone lag in the Mastery Grove selection screen. Mobile now uses a bounded canvas pixel budget and 24 FPS ambient scheduler, suspends decorative drawing during touch/scroll, hidden, modal, and active-game states, removes live mobile backdrop blur and animated grain, reduces paint-heavy effects, and skips offscreen card rendering. Desktop retains the full visual treatment. A dedicated performance contract prevents these budgets from regressing.

This candidate completes Lumenloom's portrait-mobile release pass and Garden Awakening spectacle. It adds relative thumb steering, independent WEAVE/RELEASE input, compact mobile copy, reachable responsive geometry, portrait orientation handling, and automatic profile forwarding from Mastery Grove. The garden now carries five distinct night atmospheres, shape-backed target guidance, layered luminous thread and knots, persistent capped awakening marks, closure bloom waves, a responsive Hollow Guardian, and staged dawn. Mastery Grove also quiets its game bar during active play while preserving a clear 44px return control. Desktop and mobile share the same gameplay rules, scoring, progression, results, saves, and Grove protocol.

This repository now produces a small, allowlisted web release containing Mastery Grove, Lumenloom, Bloomfold, Ripplewake, Prismbind, and Mothchorus. Never distribute the workspace root; it also contains development videos, staging material, and unrelated Unity projects.

This D-025 candidate adds release-validation and public-trust infrastructure without changing gameplay or progression. The Grove exposes factual build, local-data, review-status, feedback, and user-initiated diagnostic information. Manual device and uncoached validation materials live under `release-validation/` and are intentionally excluded from the public payload. No analytics, automatic telemetry, ad SDK, account, or remote save service is introduced.

## Build and verify

Install Node.js 18 or newer, then run:

```text
node tools/release.mjs release
```

The command syntax-checks every product and tooling script, runs every discovered `*.test.js`, checks HTML/CSS local references and duplicate IDs, clears only the workspace `dist` folder, copies the runtime allowlist, and writes SHA-256 evidence for every payload file to `dist/release-manifest.json` (the manifest does not hash itself).

Publish or zip the **contents of `dist`**. Its stable public entrypoint is `dist/index.html`; the canonical game hub remains `dist/MasteryGrove/index.html`.

## Local play

Double-click **PLAY MASTERY GROVE.cmd**. It rebuilds the release and serves only `dist` at `http://127.0.0.1:4173/`, giving all five arcade games one predictable browser storage origin. Keep its terminal window open while playing.

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

## D-025 controlled web-beta evidence

Use `release-validation/README.md` as the ordered owner/tester gate. A candidate is not promoted merely because automated checks pass: the exact public URL still needs clean-profile physical-device, uncoached comprehension/replay, save/recovery, and owner privacy/credits evidence. Only repeatable release blockers should expand the pre-beta code scope.
