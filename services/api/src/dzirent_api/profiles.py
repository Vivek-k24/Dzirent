"""Own application profile, preferences and lender enrollment. No arbitrary user administration."""

from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from . import models as wire
from . import orm, serializers
from .catalog import zip_metro
from .db import get_session
from .errors import ApiError, Detail, field_error, invalid
from .identity import Principal, bearer, current_principal
from .validation import clean_text

router = APIRouter(prefix="/api/v1", dependencies=[Depends(bearer)])
DEFAULT_DISPLAY_NAME = "New member"


def find_user(session: Session, principal: Principal) -> orm.User | None:
    return session.scalar(
        select(orm.User)
        .where(
            orm.User.auth_provider == principal.provider,
            orm.User.auth_subject == principal.subject,
        )
        .options(selectinload(orm.User.roles), selectinload(orm.User.lender_profile))
        .execution_options(populate_existing=True)
    )


def current_user(
    principal: Principal = Depends(current_principal), session: Session = Depends(get_session)
) -> orm.User:
    user = find_user(session, principal)
    if user is None:
        raise ApiError(
            404, "profile_not_found", "Create the application profile with POST /me/bootstrap."
        )
    return user


def active_user(
    user: orm.User = Depends(current_user), session: Session = Depends(get_session)
) -> orm.User:
    if user.status != "active":
        raise ApiError(403, "account_inactive", "This application profile is deactivated.")
    if user.auth_provider == "native":
        credential = session.get(orm.AuthCredential, user.id)
        if credential is None or credential.email_verified_at is None:
            raise ApiError(
                403,
                "email_verification_required",
                "Verify your email before changing profile or lender data.",
            )
    return user


def current_lender(user: orm.User = Depends(active_user)) -> orm.LenderProfile:
    profile = user.lender_profile
    if (
        profile is None
        or profile.status != "active"
        or not any(role.role == "lender" for role in user.roles)
    ):
        raise ApiError(403, "lender_required", "Lender enrollment required.")
    return profile


def require_metro(session: Session, metro_id: object, field: str, errors: list[Detail]) -> None:
    if metro_id is None:
        return
    if (
        session.scalar(select(orm.Metro.id).where(orm.Metro.id == metro_id, orm.Metro.active))
        is None
    ):
        errors.append(field_error(field, "unknown_value", "Unknown metro."))


@router.post("/me/bootstrap", response_model=wire.CurrentUser, operation_id="bootstrapMe")
def bootstrap_me(
    principal: Principal = Depends(current_principal), session: Session = Depends(get_session)
) -> Any:
    if principal.provider == "native":
        # A resolved native session already has its canonical user and renter membership.
        # Bootstrap must never manufacture a password identity or promote a dormant subject.
        user = find_user(session, principal)
        if user is None:
            raise ApiError(401, "unauthenticated", "Sign in to continue.")
        return serializers.current_user(user)
    # Idempotent for the verified subject; concurrent first calls converge on one row.
    name = (principal.name or "").strip()[:100] or DEFAULT_DISPLAY_NAME
    session.execute(
        insert(orm.User)
        .values(
            id=uuid4(),
            auth_provider=principal.provider,
            auth_subject=principal.subject,
            display_name=name,
            email=principal.email,
            status="active",
        )
        .on_conflict_do_nothing(constraint="uq_users_provider_subject")
    )
    user = find_user(session, principal)
    assert user is not None
    if user.status == "active":
        session.execute(
            insert(orm.UserRole).values(user_id=user.id, role="renter").on_conflict_do_nothing()
        )
    session.commit()
    return serializers.current_user(find_user(session, principal))  # type: ignore[arg-type]


@router.get("/me", response_model=wire.CurrentUser, operation_id="getMe")
def get_me(user: orm.User = Depends(current_user)) -> Any:
    return serializers.current_user(user)


@router.patch("/me", response_model=wire.CurrentUser, operation_id="updateMe")
def update_me(
    body: wire.ProfilePatch,
    user: orm.User = Depends(active_user),
    session: Session = Depends(get_session),
) -> Any:
    errors: list[Detail] = []
    name = clean_text(body.display_name, "body.display_name", 100, errors)
    if errors:
        raise invalid(*errors)
    user.display_name = name
    session.commit()
    session.refresh(user)
    return serializers.current_user(user)


@router.delete("/me", response_model=wire.CurrentUser, operation_id="deactivateMe")
def deactivate_me(
    user: orm.User = Depends(current_user), session: Session = Depends(get_session)
) -> Any:
    if user.auth_provider == "native":
        raise ApiError(
            403,
            "reauthentication_required",
            "Use POST /auth/deactivate with your current password.",
        )
    # Deactivates the application profile; the inactive lender profile hides owned listings from
    # the public catalog while preserving their history. Provider identity is untouched.
    if user.status != "inactive":
        user.status = "inactive"
        if user.lender_profile is not None:
            user.lender_profile.status = "inactive"
        session.commit()
        session.refresh(user)
    return serializers.current_user(user)


def preferences_of(user: orm.User, session: Session) -> wire.Preferences:
    row = session.get(orm.UserPreferences, user.id, populate_existing=True)
    if row is None:
        return wire.Preferences()
    return wire.Preferences(metro_id=row.metro_id, postal_code=row.postal_code)


@router.get("/me/preferences", response_model=wire.Preferences, operation_id="getPreferences")
def get_preferences(
    user: orm.User = Depends(current_user), session: Session = Depends(get_session)
) -> Any:
    return preferences_of(user, session)


@router.patch("/me/preferences", response_model=wire.Preferences, operation_id="updatePreferences")
def update_preferences(
    body: wire.Preferences,
    user: orm.User = Depends(active_user),
    session: Session = Depends(get_session),
) -> Any:
    # Only supplied fields change; an explicit null clears that field.
    current = preferences_of(user, session)
    metro_id = body.metro_id if "metro_id" in body.model_fields_set else current.metro_id
    postal_code = (
        body.postal_code if "postal_code" in body.model_fields_set else current.postal_code
    )
    errors: list[Detail] = []
    require_metro(session, metro_id, "body.metro_id", errors)
    # The wire pattern permits Unicode digits, but PostgreSQL deliberately stores ASCII ZIPs.
    # Validate before the upsert without changing the frozen OpenAPI schema.
    if postal_code is not None and not (postal_code.isascii() and postal_code.isdecimal()):
        errors.append(
            field_error("body.postal_code", "invalid_format", "Use five ASCII digits for ZIP.")
        )
    if not errors and metro_id is not None and postal_code is not None:
        if zip_metro(session, postal_code) != metro_id:
            errors.append(
                field_error(
                    "body.postal_code",
                    "metro_conflict",
                    "ZIP and metro identify different locations.",
                )
            )
    if errors:
        raise invalid(*errors)
    session.execute(
        insert(orm.UserPreferences)
        .values(user_id=user.id, metro_id=metro_id, postal_code=postal_code)
        .on_conflict_do_update(
            index_elements=[orm.UserPreferences.user_id],
            set_={"metro_id": metro_id, "postal_code": postal_code, "updated_at": func.now()},
        )
    )
    session.commit()
    return preferences_of(user, session)


@router.post("/me/lender-profile", response_model=wire.LenderProfile, operation_id="enrollLender")
def enroll_lender(
    body: wire.LenderEnrollment,
    user: orm.User = Depends(active_user),
    session: Session = Depends(get_session),
) -> Any:
    # Idempotent enrollment of the verified subject only; an existing profile is returned as-is.
    if user.lender_profile is not None:
        return serializers.lender_profile(user.lender_profile)
    errors: list[Detail] = []
    name = clean_text(body.display_name, "body.display_name", 100, errors)
    require_metro(session, body.metro_id, "body.metro_id", errors)
    if errors:
        raise invalid(*errors)
    session.execute(
        insert(orm.LenderProfile)
        .values(id=uuid4(), user_id=user.id, display_name=name, metro_id=body.metro_id)
        .on_conflict_do_nothing(index_elements=[orm.LenderProfile.user_id])
    )
    session.execute(
        insert(orm.UserRole).values(user_id=user.id, role="lender").on_conflict_do_nothing()
    )
    session.commit()
    profile = session.scalar(
        select(orm.LenderProfile)
        .where(orm.LenderProfile.user_id == user.id)
        .execution_options(populate_existing=True)
    )
    assert profile is not None
    return serializers.lender_profile(profile)
