"""Conservative local file cleanup; dry run unless explicitly --apply. No SQL writes."""

import argparse
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from . import orm
from .db import create_db_engine, session_factory
from .media_storage import KEY, PrivateFiles
from .settings import Settings


def cleanup(
    session: Session, backend: PrivateFiles, *, apply: bool = False
) -> dict[str, int | bool]:
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    inspected = candidates = removed = 0
    # Bounded scan; never follow directories/links or touch names outside our immutable namespace.
    for path in backend.root.iterdir():
        inspected += 1
        if inspected > 1000 or candidates >= 100:
            break
        if not KEY.fullmatch(path.name) or path.is_symlink() or not path.is_file():
            continue
        if datetime.fromtimestamp(path.stat().st_mtime, UTC) >= cutoff:
            continue
        image = session.scalar(
            select(orm.ProductImage.id).where(orm.ProductImage.object_key == path.name).limit(1)
        )
        reservation = session.scalar(
            select(orm.MediaUpload.id)
            .where(
                orm.MediaUpload.object_key == path.name,
                or_(
                    orm.MediaUpload.expires_at > cutoff,
                    orm.MediaUpload.completed_image_id.is_not(None),
                ),
            )
            .limit(1)
        )
        if image is not None or reservation is not None:
            continue
        candidates += 1
        if apply:
            backend.remove(path.name)
            removed += 1
    return {
        "dry_run": not apply,
        "inspected": min(inspected, 1000),
        "candidates": candidates,
        "removed": removed,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Remove eligible unreferenced local objects"
    )
    args = parser.parse_args()
    settings = Settings()
    if settings.deployed or settings.media_backend != "filesystem":
        raise SystemExit("Only explicit local/test filesystem media is supported")
    engine = create_db_engine(settings)
    if engine is None:
        raise SystemExit("An explicit local database configuration is required")
    try:
        with session_factory(engine)() as session:
            print(
                json.dumps(
                    cleanup(session, PrivateFiles(Path(settings.media_root)), apply=args.apply)
                )
            )
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
