"""Owner-only utilities. Never imported by the API; no execution except explicit module entry.

Phase 1: source only. These gates do not constitute permission to run the utilities.
"""

import argparse
import getpass
import hashlib
import json
import os
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from .. import orm
from ..db import create_db_engine, session_factory
from ..settings import Settings
from .crypto import hash_password, verify_password
from .service import lock_user

RENTER = "test01_renter@example.com"
LENDER = "test01_lender@example.com"
ACK = "issue26-owner-approved-phase2"


def guarded_settings(args: argparse.Namespace) -> Settings:
    if not args.execute or os.environ.get("DZIRENT_AUTH_OPERATOR_ACK") != ACK:
        raise SystemExit("Execution disabled: obtain owner Phase 2 authorization and set the operator acknowledgement.")
    settings = Settings()
    url = make_url(settings.database_url.get_secret_value())
    if url.drivername not in {"postgresql", "postgresql+psycopg", "postgres"}:
        raise SystemExit("Only PostgreSQL/psycopg connections are allowed.")
    if not url.username or not re.fullmatch(r"[a-z0-9.-]+", url.host or ""):
        raise SystemExit("Use one explicit database login and one DNS/loopback host.")
    if set(url.query) - {"sslmode", "sslrootcert"}:
        raise SystemExit("Connection query overrides and service/failover targets are refused.")
    if any(os.environ.get(name) for name in ("PGSERVICE", "PGSERVICEFILE", "PGOPTIONS", "PGHOSTADDR")):
        raise SystemExit("Clear inherited libpq service/address/options overrides before operator use.")
    if settings.mode != "connected" or settings.identity_mode != "native":
        raise SystemExit("Operator utilities require explicit connected native mode.")
    if settings.environment not in {"staging", "test"}:
        raise SystemExit("Operator utilities refuse local/production environments.")
    if not args.expected_host or url.host != args.expected_host:
        raise SystemExit("Protected database host does not match the explicit expected host.")
    if settings.environment == "staging":
        if url.database != "dzirent_staging" or not (url.host or "").endswith(".postgres.database.azure.com"):
            raise SystemExit("Staging target must be the reviewed isolated Azure staging database.")
        if url.query.get("sslmode") != "verify-full":
            raise SystemExit("Staging utilities require TLS verify-full.")
    elif not (url.database or "").endswith("_test") or url.host not in {"localhost", "127.0.0.1"}:
        raise SystemExit("Test utilities require a disposable loopback *_test database.")
    if any(part in (url.host or "").casefold() for part in ("production", "-prod-")):
        raise SystemExit("Production-like target refused.")
    return settings


def guard_connection(session: Session, settings: Settings) -> None:
    expected = make_url(settings.database_url.get_secret_value())
    database, role = session.execute(text("SELECT current_database(), current_user")).one()
    if database != expected.database or role != expected.username:
        raise SystemExit("Connected database/login differs from the protected operator target.")
    if settings.environment == "staging" and role != "dzirent_migrator":
        raise SystemExit("Use the reviewed owner-controlled migrator login, never runtime.")


def synthetic_accounts(args: argparse.Namespace, settings: Settings) -> None:
    if args.synthetic_email_policy != "operator-asserted-no-mail":
        raise SystemExit("Explicit synthetic email policy acknowledgement is required.")
    # Password is never a CLI argument, printed value, source constant or recoverable database field.
    password = os.environ.pop("DZIRENT_STAGING_TEST_PASSWORD", None)
    if password is None:
        password = getpass.getpass("Private shared synthetic-account password: ")
        if password != getpass.getpass("Confirm private password: "):
            raise SystemExit("Password confirmation did not match.")
    if not 12 <= len(password) <= 128:
        raise SystemExit("Synthetic password must contain 12–128 characters.")
    engine = create_db_engine(settings)
    if engine is None:
        raise SystemExit("No database configured.")
    enrolled = False
    try:
        with session_factory(engine).begin() as session:
            guard_connection(session, settings)
            # One transaction and advisory lock serialize repeat runs without resetting accounts.
            session.execute(text("SELECT pg_advisory_xact_lock(724100126)"))
            for email, name in ((RENTER, "Staging renter"), (LENDER, "Staging lender")):
                credential = session.scalar(select(orm.AuthCredential).where(orm.AuthCredential.email_normalized == email))
                if credential is None:
                    existing = session.scalar(select(orm.User.id).where(orm.User.auth_provider == "native", func.lower(func.btrim(orm.User.email)) == email))
                    if existing is not None:
                        raise SystemExit("An existing subject requires owner reconciliation; no account was adopted.")
                    user_id = uuid4()
                    user = orm.User(id=user_id, auth_provider="native", auth_subject=str(user_id), email=email, display_name=name, status="active")
                    session.add(user)
                    session.flush()
                    credential = orm.AuthCredential(
                        user_id=user_id, email_normalized=email, password_hash=hash_password(password),
                        synthetic=True, email_verified_at=datetime.now(UTC),
                    )
                    session.add_all([credential, orm.UserRole(user_id=user_id, role="renter"), orm.UserPreferences(user_id=user_id)])
                    session.flush()
                else:
                    user = lock_user(session, credential.user_id)
                    if user is None or user.status != "active" or user.auth_provider != "native" or not credential.synthetic or credential.email_verified_at is None:
                        raise SystemExit("Existing identity is not an eligible synthetic account; no reset/reactivation performed.")
                    if not verify_password(credential.password_hash, password):
                        raise SystemExit("Existing synthetic credential differs; owner review is required. No password changed.")
                session.execute(insert(orm.UserRole).values(user_id=user.id, role="renter").on_conflict_do_nothing())
                if email == LENDER:
                    if user.lender_profile is not None:
                        enrolled = user.lender_profile.status == "active"
                        if enrolled:
                            session.execute(insert(orm.UserRole).values(user_id=user.id, role="lender").on_conflict_do_nothing())
                    elif args.metro_id is not None:
                        metro = session.get(orm.Metro, args.metro_id)
                        if metro is None or not metro.active:
                            raise SystemExit("Choose legitimately configured active reference metro data; none was fabricated.")
                        session.add_all([
                            orm.LenderProfile(user_id=user.id, display_name=name, metro_id=metro.id, status="active"),
                            orm.UserRole(user_id=user.id, role="lender"),
                        ])
                        enrolled = True
        print("Synthetic identities prepared; no credentials were printed and no email was sent.")
        print("Lender enrollment complete." if enrolled else "Lender enrollment pending legitimate reference metro data; renter membership remains.")
    finally:
        password = ""  # Python cannot promise zeroization; bound lifetime and do not log it.
        engine.dispose()


def admin_grant(args: argparse.Namespace, settings: Settings) -> None:
    # No email-based lookup or create/reset path. The owner must first discover the actual identity.
    evidence_path = Path(args.identity_evidence)
    raw = evidence_path.read_bytes()
    evidence = json.loads(raw)
    url = make_url(settings.database_url.get_secret_value())
    if (
        evidence.get("user_id") != str(args.user_id)
        or evidence.get("environment") != settings.environment
        or evidence.get("database") != url.database or evidence.get("host") != url.host
        or evidence.get("owner_authorized") is not True
        or not evidence.get("trusted_creation_route") or not evidence.get("ownership_verification_route")
    ):
        raise SystemExit("Private owner evidence does not establish this existing identity and environment.")
    if getpass.getpass("Owner confirmation (type the exact existing user UUID): ") != str(args.user_id):
        raise SystemExit("Owner confirmation did not match.")
    engine = create_db_engine(settings)
    if engine is None:
        raise SystemExit("No database configured.")
    try:
        with session_factory(engine).begin() as session:
            guard_connection(session, settings)
            user = lock_user(session, args.user_id)
            credential = session.get(orm.AuthCredential, args.user_id)
            if user is None or user.auth_provider != "native" or credential is None or credential.synthetic:
                raise SystemExit("Target must be an existing non-synthetic native identity.")
            if args.action == "grant" and (user.status != "active" or credential.email_verified_at is None):
                raise SystemExit("Grant target must already be active and independently email verified.")
            if credential.email_normalized != "admin@dzirent.com" or evidence.get("email") != credential.email_normalized:
                raise SystemExit("Existing identity does not match the owner's designated administrator evidence.")
            now = datetime.now(UTC)
            grants = list(session.scalars(select(orm.PlatformAdminGrant).where(
                orm.PlatformAdminGrant.user_id == user.id,
                orm.PlatformAdminGrant.capability == "operations:access",
                orm.PlatformAdminGrant.revoked_at.is_(None),
            ).with_for_update()))
            if args.action == "grant":
                if any(grant.expires_at is None or grant.expires_at > now for grant in grants):
                    print("Requested capability already granted; password and identity untouched.")
                    return
                grant = orm.PlatformAdminGrant(user_id=user.id, capability="operations:access", expires_at=now + timedelta(days=args.days))
                session.add(grant)
                session.flush()
                grants = [grant]
            for grant in grants:
                if args.action == "revoke":
                    grant.revoked_at = now
                session.add(orm.PlatformAdminEvent(
                    grant_id=grant.id, action=args.action, operator=args.operator,
                    reason=args.reason, evidence_sha256=hashlib.sha256(raw).hexdigest(),
                ))
        print("Owner-controlled capability operation committed with audit evidence digest; no password changed.")
    finally:
        engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Owner-reviewed Phase 2 operations only; not executed in Phase 1.")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--expected-host", required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    synthetic = sub.add_parser("synthetic-accounts")
    synthetic.add_argument("--synthetic-email-policy", required=True, choices=["operator-asserted-no-mail"])
    synthetic.add_argument("--metro-id", type=UUID)
    admin = sub.add_parser("admin-capability")
    admin.add_argument("--user-id", type=UUID, required=True)
    admin.add_argument("--identity-evidence", required=True)
    admin.add_argument("--operator", required=True)
    admin.add_argument("--reason", required=True)
    admin.add_argument("--action", choices=["grant", "revoke"], required=True)
    admin.add_argument("--days", type=int, default=7, choices=range(1, 31))
    args = parser.parse_args()
    if args.command == "admin-capability" and (not 1 <= len(args.operator) <= 100 or not 1 <= len(args.reason) <= 500):
        raise SystemExit("Operator/reason must be bounded nonempty audit text, without secrets.")
    settings = guarded_settings(args)
    if args.command == "synthetic-accounts":
        synthetic_accounts(args, settings)
    else:
        admin_grant(args, settings)


if __name__ == "__main__":
    # No traceback containing connection metadata or private evidence on operator failure.
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        raise SystemExit("Operator action failed; no credentials or connection metadata will be printed.") from None
