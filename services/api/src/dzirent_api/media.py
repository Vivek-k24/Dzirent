"""Real private local/test photo intake; all identity/ownership stays in FastAPI."""

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models as wire
from . import orm, profiles, serializers
from .catalog import public_predicate
from .db import get_session
from .errors import ApiError, field_error, invalid, not_found, unavailable
from .identity import bearer, current_principal
from .listings import MAX_IMAGES, detail_after_commit, load_owned, lock_owned
from .media_imaging import normalize
from .media_policy import MAX_BYTES, PHOTO_TYPES
from .media_storage import PrivateFiles
from .profiles import current_lender

router = APIRouter(prefix="/api/v1", dependencies=[Depends(bearer)])


def storage(request: Request) -> PrivateFiles:
    backend: PrivateFiles | None = request.app.state.media_storage
    if backend is None:
        raise unavailable("Photo uploads are not configured. Your listing was not changed.")
    return backend


def lock_product(session: Session, lender: orm.LenderProfile, product_id: UUID) -> orm.Product:
    found = session.scalar(
        select(orm.Product.id)
        .where(orm.Product.id == product_id, orm.Product.lender_profile_id == lender.id)
        .with_for_update()
    )
    if found is None:
        raise not_found("Product not found.")
    return load_owned(session, lender, product_id)


def reservation(session: Session, product: orm.Product, upload_id: UUID) -> orm.MediaUpload:
    upload = session.scalar(
        select(orm.MediaUpload)
        .where(
            orm.MediaUpload.id == upload_id,
            orm.MediaUpload.product_id == product.id,
            orm.MediaUpload.lender_profile_id == product.lender_profile_id,
        )
        .with_for_update()
    )
    if upload is None:
        raise not_found("Upload not found.")
    if upload.status != "complete" and upload.expires_at <= datetime.now(UTC):
        raise ApiError(
            409, "upload_expired", "This upload expired. Select the photo again to retry."
        )
    return upload


@router.post(
    "/lender/products/{id}/images/upload-intent",
    response_model=wire.UploadIntent,
    operation_id="createUploadIntent",
)
def create_intent(
    id: UUID,
    body: wire.UploadIntentRequest,
    request: Request,
    lender: orm.LenderProfile = Depends(current_lender),
    session: Session = Depends(get_session),
) -> wire.UploadIntent:
    storage(request)
    product = lock_product(session, lender, id)
    if product.status == "archived":
        raise ApiError(409, "listing_archived", "Restore this listing before uploading photos.")
    if not body.rights_confirmed:
        raise invalid(
            field_error(
                "body.rights_confirmed",
                "consent_required",
                "Confirm your rights and any identifiable person's consent before uploading.",
            )
        )
    if body.size_bytes > MAX_BYTES:
        raise ApiError(413, "payload_too_large", "Export a photo no larger than 4 MB.")
    now = datetime.now(UTC)
    pending = (
        session.scalar(
            select(func.count())
            .select_from(orm.MediaUpload)
            .where(
                orm.MediaUpload.product_id == id,
                orm.MediaUpload.status != "complete",
                orm.MediaUpload.expires_at > now,
            )
        )
        or 0
    )
    if len(product.images) + pending >= MAX_IMAGES:
        raise ApiError(
            409,
            "photo_limit",
            "At most 12 attached or pending photos. Remove one or let unused uploads expire.",
        )
    upload = orm.MediaUpload(
        id=uuid4(),
        product_id=id,
        lender_profile_id=lender.id,
        content_type=body.content_type,
        declared_size=body.size_bytes,
        rights_confirmed=True,
        status="pending",
        expires_at=now + timedelta(minutes=10),
    )
    session.add(upload)
    session.commit()
    origin = request.app.state.settings.auth_web_origin
    return wire.UploadIntent(
        upload_id=upload.id,
        upload_url=f"{origin}/auth/api/lender/products/{id}/images/uploads/{upload.id}",
        method="PUT",
        headers={"Content-Type": upload.content_type},
        expires_at=upload.expires_at,
        max_size_bytes=MAX_BYTES,
    )


@router.put(
    "/lender/products/{id}/images/uploads/{upload_id}",
    response_model=wire.UploadReceipt,
    operation_id="putUploadBytes",
    openapi_extra={
        "requestBody": {
            "content": {
                mime: {"schema": {"type": "string", "format": "binary"}}
                for mime in sorted(PHOTO_TYPES)
            }
        }
    },
)
def put_bytes(
    id: UUID,
    upload_id: UUID,
    request: Request,
    data: Annotated[bytes, Body(media_type="image/jpeg")],
    lender: orm.LenderProfile = Depends(current_lender),
    session: Session = Depends(get_session),
) -> wire.UploadReceipt:
    backend = storage(request)
    product = lock_product(session, lender, id)
    upload = reservation(session, product, upload_id)
    if product.status == "archived":
        raise ApiError(409, "listing_archived", "Restore this listing before uploading photos.")
    if upload.status != "pending":
        raise ApiError(
            409,
            "upload_used",
            "These bytes were already received. Finish attachment or start a new upload.",
        )
    content_type = request.headers.get("content-type", "").split(";", 1)[0]
    if content_type != upload.content_type or len(data) != upload.declared_size:
        raise invalid(
            field_error(
                "body",
                "file_mismatch",
                "The photo changed. Select it again to start a fresh upload.",
            )
        )
    photo = normalize(data, content_type)
    key = uuid4().hex + ".jpg"
    backend.put(key, photo.data)
    upload.object_key, upload.byte_size = key, len(photo.data)
    upload.sha256, upload.width, upload.height = (
        sha256(photo.data).hexdigest(),
        photo.width,
        photo.height,
    )
    upload.status = "uploaded"
    try:
        session.commit()
    except Exception:
        session.rollback()
        # This request created only this immutable key. A process crash leaves a private orphan,
        # eligible for conservative operator cleanup; no draft is published or attached.
        try:
            backend.remove(key)
        except OSError:
            pass
        raise
    return wire.UploadReceipt(
        upload_id=upload.id, status="uploaded", width=photo.width, height=photo.height
    )


@router.post(
    "/lender/products/{id}/images/complete",
    response_model=wire.ProductDetail,
    operation_id="completeUpload",
)
def complete(
    id: UUID,
    body: wire.UploadComplete,
    request: Request,
    lender: orm.LenderProfile = Depends(current_lender),
    session: Session = Depends(get_session),
) -> wire.ProductDetail:
    backend = storage(request)
    product = lock_product(session, lender, id)
    upload = reservation(session, product, body.upload_id)
    if upload.status == "complete":
        if not any(image.id == upload.completed_image_id for image in product.images):
            raise ApiError(
                409, "photo_removed", "The attached photo was removed. Start a new upload."
            )
        return serializers.product_detail(product)  # Idempotent after a lost acknowledgement.
    product = lock_owned(session, lender, id, body.expected_version)
    if product.status == "archived" or len(product.images) >= MAX_IMAGES:
        raise ApiError(
            409, "photo_limit", "This listing cannot accept another photo. Refresh before retrying."
        )
    if (
        upload.status != "uploaded"
        or not upload.object_key
        or not upload.byte_size
        or not upload.sha256
        or not upload.width
        or not upload.height
    ):
        raise ApiError(409, "upload_not_ready", "Upload the photo bytes before attaching them.")
    alt_text = body.alt_text.strip()
    if not alt_text or any(ord(c) < 32 for c in alt_text):
        raise invalid(
            field_error("body.alt_text", "invalid_text", "Describe the photo using plain text.")
        )
    backend.read(upload.object_key, upload.byte_size, upload.sha256)
    image_id = uuid4()
    product.images.append(
        orm.ProductImage(
            id=image_id,
            object_key=upload.object_key,
            fixture_url=None,
            alt_text=alt_text,
            sort_order=len(product.images),
            width=upload.width,
            height=upload.height,
            media_status="ready",
        )
    )
    session.flush()  # Insert the image before updating the reservation FK, in the same transaction.
    upload.status, upload.completed_image_id = "complete", image_id
    product.version += 1
    return detail_after_commit(session, lender, id)


@router.get(
    "/media/{image_id}",
    response_class=Response,
    operation_id="getMediaContent",
    responses={
        200: {"content": {"image/jpeg": {"schema": {"type": "string", "format": "binary"}}}}
    },
)
def content(image_id: UUID, request: Request, session: Session = Depends(get_session)) -> Response:
    backend = storage(request)
    row = session.execute(
        select(orm.ProductImage, orm.MediaUpload, orm.Product)
        .join(orm.Product, orm.Product.id == orm.ProductImage.product_id)
        .join(orm.MediaUpload, orm.MediaUpload.completed_image_id == orm.ProductImage.id)
        .where(orm.ProductImage.id == image_id, orm.MediaUpload.status == "complete")
    ).one_or_none()
    if row is None:
        raise not_found("Photo not found.")
    image, upload, product = row
    public = session.scalar(
        select(orm.Product.id).where(orm.Product.id == product.id, public_predicate())
    )
    if public is None:
        try:
            principal = current_principal(request, session)
            user = profiles.current_user(principal, session)
            lender = profiles.current_lender(profiles.active_user(user, session))
            if lender.id != product.lender_profile_id:
                raise not_found()
        except ApiError as exc:
            if exc.status not in {401, 403, 404}:
                raise
            raise not_found("Photo not found.") from exc
    if not image.object_key or not upload.byte_size or not upload.sha256:
        raise unavailable("The stored photo is unavailable.")
    data = backend.read(image.object_key, upload.byte_size, upload.sha256)
    return Response(
        data,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": 'inline; filename="garment.jpg"',
        },
    )
