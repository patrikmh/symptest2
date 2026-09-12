# Tools (packs)

The four MVP packs live in `@lots/packs`: Web Research, GitHub, Gmail,
Calendar.

- UI: `/app/packs` and `/app/packs/:packKey` (nav label **Tools**)
- Enable/disable is a `CapabilityInstall` (`kind: lots-pack`). Web defaults on.
- Connect uses shared Google OAuth (Gmail + Calendar) or a GitHub OAuth App.
  Tokens sit in `EncryptedSecretStore` via `Connection` (`connectorId: lots`).
- Classification (READ / DRAFT / EXTERNAL_WRITE / DESTRUCTIVE) overrides
  Rakazo name heuristics. `gmail.createDraft` stays ALLOW.
- External writes use `lotsEffectIdempotencyKey`. Timeouts become UNKNOWN
  (`uncertain`); `effect.reconcile` looks the action up before anyone retries.

Live GitHub/Gmail/Calendar HTTP execute is not implemented yet. Unconnected
writes error with “needs a connected account.”
