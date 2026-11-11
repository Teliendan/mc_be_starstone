# Localization

Workflow and checks: workspace `docs/localization.md`.

2026-10-04; written for Bedrock 1.26.52 / Script API 2.8.0 (the manifest now uses 2.11.0).
Commit: `Localize starstone with contextual catalogs and nine locales`.

Owner approved (2026-10-04) English, Czech, Spanish Spain/Mexico, Portuguese Portugal/Brazil, German, French and Polish, with context and localization required during future development. Catalogs are mod-scoped (`localization/catalog.json`); en_GB=en_US and fr_CA=fr_FR are compatibility aliases.

Review status: eight target locales are AI-authored contextual drafts (`ai-draft`). No native-language review or game testing of this localization pass is claimed.

Vanilla terminology: Mojang bedrock-samples commit `46ba6ea985fb5a92d79a9419198f10dda14c199d`, documented not verified in game. Shared terms: workspace `docs/localization-terminology.json`.

## Mod-specific rules

Preserve Starstone as material/mod brand. Bridge means an isolated electrical crossing; Conduit is an electrical component, not the vanilla underwater block. Diagnostic commands/IDs/direction enums stay technical. Invalid inner-corner placement sends a translated notice.
