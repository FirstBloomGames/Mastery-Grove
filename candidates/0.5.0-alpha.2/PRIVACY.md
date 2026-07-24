# Privacy notice — owner-review draft

> **PUBLICATION GATE:** Owner and qualified legal/privacy review are required before this draft is treated as the final policy or used for a store or portal submission.

- Runtime behavior last reviewed: 2026-07-13
- Effective date: Pending owner approval
- Studio name: First Bloom Games
- Publisher/legal entity and final rights holder: Pending owner approval
- Final privacy contact: Pending owner approval
- Pre-release technical feedback: https://github.com/FirstBloomGames/Mastery-Grove/issues

## Current release behavior

The allowlisted First Bloom web runtime has no accounts, advertising SDKs, analytics, trackers, external assets, or network API calls. It stores gameplay progress locally in the player's browser, including Grove totals and personal bests under keys such as `first-bloom-grove-v1`, its `first-bloom-grove-v1-backup` recovery copy, `lumenloom-best`, `bloomfold-best`, `bloomfold-specimens`, `ripplewake-best`, and `prismbind-best`.

That information remains on the device unless the player clears browser/site data or uses the in-game reset. A player can explicitly export it as a JSON backup file and later choose that file for local import. The current game code does not transmit it to First Bloom Games.

## Distribution-platform notice

The website host, game portal, app store, mobile wrapper, advertising provider, or future analytics/crash service may collect information independently. Their actual behavior and policies must be reviewed and disclosed here before release. If any SDK or remote service is added, this draft is no longer complete.

## Player requests and retention

The final publisher identity, applicable jurisdictions, formal privacy contact, retention statement, children's-privacy position, and request process remain pending owner and qualified review. Local-only gameplay data can presently be removed through the Grove reset or browser/site-data controls. An exported backup remains wherever the player chooses to save it until the player deletes it.

The public issue tracker is suitable for pre-release technical feedback only. Players should not post personal, confidential, exported-save, or other sensitive information there.
