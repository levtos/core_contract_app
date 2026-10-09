# TERRA branding

Product: **TERRA**, repository `levtos/core_contract_app`, technical domain `core_contracts_bridge`.
Part of the Unicorn Station family; binding assignment: https://github.com/levtos/control/issues/59.

## Assets and provenance

- `original/TERRA.png`: byte-identical approved 1254 × 1254 RGB PNG from `core_contracts_logos.zip`.
- `logos/logo-{1024,512,256,128}.png`: complete square logo, including unchanged wordmark.
- `icons/icon-{512,256,128,64,32}.png`: symbol-only square crop, source box `(177, 0, 1077, 900)`, then proportional LANCZOS downsampling.
- `assets.json`: source and export SHA-256, dimensions, crop and resampling provenance.

These are raster PNG assets, not vectors. The source has an opaque baked background and pale rounded corners; no transparency, color substitution, sharpening, symbol redraw or synthesized pixels were introduced. Icon-only files intentionally omit the wordmark; the complete original remains unchanged. Dark variants use identical pixels because the approved background already supplies contrast. At 32/64 px use the symbol, not a miniature wordmark.

## Home Assistant display

Supervisor reads `core_contracts/icon.png` (128 square) and `core_contracts/logo.png` (256 square) beside `config.yaml`. Only the display name is TERRA — Core Contracts; slug `core_contracts`, image coordinates, bridge domain, database and API identities stay unchanged. The square logo is allowed by Supervisor's presentation convention.

This PR remains unmerged pending Benni's Alpha acceptance. App/bridge versions stay 1.0.0a1; no tag, container publication or deployment is authorized. The legacy core-contracts repository is untouched.

References: https://developers.home-assistant.io/docs/core/integration/brand_images/ and https://developers.home-assistant.io/docs/apps/presentation/.
