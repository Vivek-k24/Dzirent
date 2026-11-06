"""policy.json and the database's policy_item_types rows must be the same list."""

import json
import re
from pathlib import Path

from app.vocab import load, policy_rows

MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase" / "migrations"


def test_newest_policy_migration_matches_policy_json():
    seeded = [p for p in sorted(MIGRATIONS.glob("*.sql")) if "$policy$" in p.read_text(encoding="utf-8")]
    assert seeded, "no migration seeds policy_item_types"
    body = re.search(r"\$policy\$(.*?)\$policy\$", seeded[-1].read_text(encoding="utf-8"), re.S).group(1)
    assert json.loads(body) == policy_rows(), f"{seeded[-1].name} is out of date: add a migration with the new rows"


def test_policy_loads_and_every_row_is_valid():
    assert len(load().items) == len(policy_rows())
