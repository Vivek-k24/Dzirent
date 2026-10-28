"""Build an allowlisted, locked native-Python archive without loading any secrets."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import ssl
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--uv", type=Path, required=True)
    parser.add_argument("--ca-bundle", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("Existing deployment archive preserved")
    if subprocess.run(
        ["git", "diff", "--quiet", "HEAD"], cwd=ROOT, check=False
    ).returncode:
        raise SystemExit("Commit the reviewed source before packaging")
    sha = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise SystemExit("Invalid source SHA")
    ca = args.ca_bundle.read_bytes()
    if b"PRIVATE KEY" in ca or b"-----BEGIN CERTIFICATE-----" not in ca:
        raise SystemExit("Expected a public CA certificate bundle")
    ssl.create_default_context(cafile=str(args.ca_bundle))
    uv = subprocess.run(
        [
            str(args.uv),
            "export",
            "--frozen",
            "--no-dev",
            "--no-emit-project",
            "--format",
            "requirements-txt",
            "--no-header",
        ],
        cwd=ROOT / "services/api",
        capture_output=True,
        check=False,
    )
    if uv.returncode:
        raise SystemExit("Locked dependency export failed")
    paths = (
        subprocess.run(
            [
                "git",
                "ls-files",
                "-z",
                "services/api/src",
                "services/api/alembic",
                "services/api/alembic.ini",
                "contracts/modes.json",
                "infra/runtime/start-appservice.sh",
                "fixtures/catalog/taxonomy.json",
                "fixtures/catalog/manifest.json",
            ],
            cwd=ROOT,
            capture_output=True,
            check=True,
        )
        .stdout.decode()
        .split("\0")
    )
    payload = {path: (ROOT / path).read_bytes() for path in paths if path}
    if any(
        Path(path).name.startswith(".env")
        or ".." in Path(path).parts
        or path.endswith((".pyc", ".env"))
        for path in payload
    ):
        raise SystemExit("Unexpected archive entry")
    payload["requirements.txt"] = uv.stdout
    payload["infra/runtime/azure-postgres-roots.pem"] = ca
    digest = hashlib.sha256(ca).hexdigest()
    payload["infra/runtime/azure-postgres-roots.sha256"] = (
        digest + "  infra/runtime/azure-postgres-roots.pem\n"
    ).encode()
    manifest = {
        "source_sha": sha,
        "python_major_minor": "3.12",
        "mode": "connected",
        "schema_revision": "0005_auth_email_outbox",
        "email_backend": "disabled",
        "files": {
            path: hashlib.sha256(data).hexdigest() for path, data in payload.items()
        },
    }
    payload["release-manifest.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, data in sorted(payload.items()):
            archive.writestr(path, data)
    print(
        json.dumps(
            {
                "source_sha": sha,
                "archive_files": len(payload),
                "archive_sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
                "secret_files_included": False,
                "ca_bundle_verified": True,
                "dependencies": "unchanged_frozen_uv_lock",
            }
        )
    )


if __name__ == "__main__":
    main()
