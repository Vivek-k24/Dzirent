import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, Security
from fastapi.security import APIKeyCookie
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import orm
from ..db import get_session
from ..errors import ApiError
from ..models import Error
from ..settings import Settings
from . import schemas, service
from .delivery import email_delivery, reserved_mailbox
from .dispatch import reserve_after_commit
from .security import (
    clear_cookies,
    cookie_secure,
    csrf_cookie,
    issue_csrf,
    session_cookie,
    set_cookie,
)

router = APIRouter(
    prefix="/api/v1",
    tags=["native-auth"],
    responses={status: {"model": Error} for status in (400, 413, 415)},
)
Database = Annotated[Session, Depends(get_session)]
NativeSettings = Annotated[Settings, Depends(service.native_settings)]
cookie_scheme = APIKeyCookie(
    name="__Host-dzirent_session", auto_error=False, scheme_name="NativeSession"
)
log = logging.getLogger("dzirent.auth.audit")


def native_session(
    request: Request, session: Database, _: str | None = Security(cookie_scheme)
) -> service.ResolvedSession:
    return service.resolve_session(request, session)


CurrentSession = Annotated[service.ResolvedSession, Depends(native_session)]


def set_session(response: Response, settings: Settings, token: str) -> None:
    set_cookie(
        response, settings, session_cookie(settings), token, settings.auth_session_hours * 3600
    )
    # Rotation invalidates the anonymous/previous session's CSRF challenge.
    response.delete_cookie(
        csrf_cookie(settings),
        path="/",
        secure=cookie_secure(settings),
        httponly=True,
        samesite="lax",
    )


@router.get("/auth/csrf", response_model=schemas.CsrfChallenge, operation_id="getAuthCsrf")
def csrf(request: Request, response: Response, settings: NativeSettings) -> schemas.CsrfChallenge:
    return schemas.CsrfChallenge(csrf_token=issue_csrf(request, response))


@router.post(
    "/auth/register",
    response_model=schemas.AuthNotice,
    status_code=202,
    operation_id="registerAccount",
)
def register(
    body: schemas.RegistrationInput, request: Request, session: Database, settings: NativeSettings
) -> schemas.AuthNotice:
    service.throttle(request, "register", body.email)
    with service.public_response_budget():
        try:
            service.register(session, body, settings)
            session.commit()  # Delivery is submitted only after commit is acknowledged.
        except IntegrityError as exc:
            session.rollback()
            unique_email = (
                getattr(exc.orig, "sqlstate", None) == "23505"
                and getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
                == "uq_auth_credentials_email_normalized"
            )
            if not unique_email:
                raise
    return schemas.AuthNotice()


@router.post("/auth/login", response_model=schemas.AuthSessionRead, operation_id="loginAccount")
def login(
    body: schemas.LoginInput,
    request: Request,
    response: Response,
    session: Database,
    settings: NativeSettings,
) -> schemas.AuthSessionRead:
    service.throttle(request, "login", body.email)
    user, credential = service.login(session, body, settings)
    service.revoke_token(session, request.cookies.get(session_cookie(settings), ""))
    row, raw = service.create_session(session, user.id, settings)
    result = service.session_read(service.ResolvedSession(user, credential, row), session)
    session.commit()
    set_session(response, settings, raw)
    return result


@router.get("/auth/session", response_model=schemas.AuthSessionRead, operation_id="getAuthSession")
def current(resolved: CurrentSession, session: Database) -> schemas.AuthSessionRead:
    return service.session_read(resolved, session)


@router.post("/auth/logout", status_code=204, operation_id="logoutAccount")
def logout(
    request: Request, response: Response, session: Database, settings: NativeSettings
) -> None:
    service.throttle(request, "logout")
    service.revoke_token(session, request.cookies.get(session_cookie(settings), ""))
    session.commit()
    clear_cookies(response, settings)


@router.post("/auth/logout-all", status_code=204, operation_id="logoutAllSessions")
def logout_all(
    body: schemas.PasswordInput,
    request: Request,
    response: Response,
    resolved: CurrentSession,
    session: Database,
    settings: NativeSettings,
) -> None:
    service.throttle(request, "reauth", str(resolved.user.id))
    service.require_password(resolved, body.current_password.get_secret_value())
    service.revoke_all(session, resolved.user.id)
    session.commit()
    clear_cookies(response, settings)


@router.post(
    "/auth/password/change", response_model=schemas.AuthSessionRead, operation_id="changePassword"
)
def change_password(
    body: schemas.PasswordChange,
    request: Request,
    response: Response,
    resolved: CurrentSession,
    session: Database,
    settings: NativeSettings,
) -> schemas.AuthSessionRead:
    service.throttle(request, "reauth", str(resolved.user.id))
    service.require_password(resolved, body.current_password.get_secret_value())
    service.replace_password(session, resolved.credential, body.new_password.get_secret_value())
    row, raw = service.create_session(session, resolved.user.id, settings)
    result = service.session_read(
        service.ResolvedSession(resolved.user, resolved.credential, row), session
    )
    session.commit()
    set_session(response, settings, raw)
    return result


@router.post(
    "/auth/email/request",
    response_model=schemas.AuthNotice,
    status_code=202,
    operation_id="requestEmailVerification",
)
def request_verification(
    request: Request, resolved: CurrentSession, session: Database, settings: NativeSettings
) -> schemas.AuthNotice:
    service.throttle(request, "verification", str(resolved.user.id))
    email_delivery(
        settings
    )  # Same delivery-unavailable behavior before account-specific decisions.
    if resolved.credential.email_verified_at is None and not resolved.credential.synthetic:
        service.send_token(session, resolved.credential, "verify_email", settings)
        session.commit()
    return schemas.AuthNotice()


@router.post(
    "/auth/email/verify", response_model=schemas.AuthNotice, operation_id="verifyEmailOwnership"
)
def verify_email(
    body: schemas.TokenInput, request: Request, session: Database, settings: NativeSettings
) -> schemas.AuthNotice:
    service.throttle(request, "consume-token")
    _, credential = service.consume_token(session, body.token.get_secret_value(), "verify_email")
    credential.email_verified_at = datetime.now(UTC)
    session.commit()
    return schemas.AuthNotice(message="Email verified. You can sign in.")


@router.post(
    "/auth/password/request",
    response_model=schemas.AuthNotice,
    status_code=202,
    operation_id="requestPasswordReset",
)
def request_reset(
    body: schemas.EmailInput, request: Request, session: Database, settings: NativeSettings
) -> schemas.AuthNotice:
    service.throttle(request, "reset", body.email)
    email_delivery(settings)
    with service.public_response_budget():
        reserve_after_commit(session)
        credential = session.scalar(
            select(orm.AuthCredential).where(orm.AuthCredential.email_normalized == body.email)
        )
        if credential is not None:
            user = service.lock_user(session, credential.user_id)
            session.refresh(credential)
            if (
                user is not None
                and user.status == "active"
                and user.auth_provider == "native"
                and not credential.synthetic
                and not reserved_mailbox(body.email)
            ):
                service.send_token(session, credential, "reset_password", settings)
        session.commit()
    return schemas.AuthNotice()


@router.post(
    "/auth/password/reset", response_model=schemas.AuthNotice, operation_id="resetPassword"
)
def reset_password(
    body: schemas.PasswordReset,
    request: Request,
    response: Response,
    session: Database,
    settings: NativeSettings,
) -> schemas.AuthNotice:
    service.throttle(request, "consume-token")
    _, credential = service.consume_token(session, body.token.get_secret_value(), "reset_password")
    service.replace_password(session, credential, body.new_password.get_secret_value())
    session.commit()
    clear_cookies(response, settings)
    return schemas.AuthNotice(
        message="Password changed. Sign in again; previous sessions were revoked."
    )


@router.post("/auth/deactivate", status_code=204, operation_id="deactivateAccount")
def deactivate(
    body: schemas.PasswordInput,
    request: Request,
    response: Response,
    resolved: CurrentSession,
    session: Database,
    settings: NativeSettings,
) -> None:
    service.throttle(request, "reauth", str(resolved.user.id))
    service.require_password(resolved, body.current_password.get_secret_value())
    service.deactivate(session, resolved.user)
    session.commit()
    clear_cookies(response, settings)


def require_operations_access(resolved: CurrentSession, session: Database) -> orm.User:
    allowed = (
        resolved.credential.email_verified_at is not None
        and not resolved.credential.synthetic
        and "operations:access" in service.capabilities(session, resolved.user.id)
    )
    log.info("platform_admin_access", extra={"user_id": str(resolved.user.id), "allowed": allowed})
    if not allowed:
        raise ApiError(403, "platform_admin_required", "This capability is not granted.")
    return resolved.user


@router.get("/admin/access", response_model=schemas.AdminAccess, operation_id="getAdminAccess")
def admin_access(_: Annotated[orm.User, Depends(require_operations_access)]) -> schemas.AdminAccess:
    # Guard scaffold only. No KPI, financial data or universal ownership bypass is implemented.
    return schemas.AdminAccess()
