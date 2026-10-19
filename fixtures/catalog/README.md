# Deterministic candidate catalog

Contract `0.1.0-candidate.1`; fixture version `0.1.0`. Claude owns this directory after foundation merge.

- `taxonomy.json`: eight roots with exactly five children each, five Texas demo metros, a small explicit
  ZIP map, stable brand/color/size references and replaceable four-day display-price bands.
- `manifest.json`: forty unique physical garments, one per leaf/five primary per root, owned by one
  fictional lender. Two secondary Designer memberships exercise deduplication. All forty are published;
  global availability varies, date blocks are deterministic, and sample ratings include nulls/ties.
- `examples.json`: one request/response per candidate operation, plus common error bodies. Examples are
  isolated snapshots, not an ordered mutation script and not working provider auth/upload URLs.
- `generate.py`: stable UUIDv5 namespace/key generation and literal date/data inputs. No random seed,
  current time, network fetch or credentials. Future seeds upsert stable IDs, only in disposable local/test
  databases; never reseed production migrations or overwrite user rows.
- `media/garment-placeholder.svg`: locally authored 900×1200 fallback, mirrored to web public assets.
  No third-party asset rights are claimed. Real fashion photos/provenance are a Phase 1A prerequisite.

Regenerate from repository root with the pinned uv/Python:

```powershell
uv run --directory services/api --frozen --python 3.12.15 python ../../fixtures/catalog/generate.py
pnpm fixtures:check
```

Reset means cloning this exact seed, not making new IDs or using the wall clock. MSW may keep mutable
copies; canonical files stay immutable during demos. Sample identity names use `.invalid` addresses;
they are not provider accounts. No passwords or bearer tokens exist in fixtures.

Band sample ranges are only those explicitly given in brief §6.5: A [0,5000), B [5000,10000),
C [10000,15000), D [15000,∞), in USD minor units. They are display fixtures, unrelated to retail value.
Sample summary cleaning/tax lines are zero and labeled unconfigured; there is no tax/pricing engine.
Fixture dates default to 2026-11-02 through 2026-11-05 inclusive, with some blocks 2026-11-05 through
2026-11-08 to exercise inclusive overlap. Cart dates confer no hold/reservation.

Refer to `contracts/README.md` for sorting, visibility, counts, location, dates and URL semantics.
The integrator validator is a foundation consistency check, not independent Antigravity acceptance.

The API seed (`python -m dzirent_api.seed`, run from `services/api`) upserts these stable IDs into
PostgreSQL, restores seed-owned rows on rerun and leaves user-created rows untouched. It refuses
production and needs `--disposable-staging` for staging. Since API-1 the `getReadiness` example shows
the connected success response instead of the Phase 0 503.
