"""Bounded post-commit delivery. No plaintext tokens at rest and no hosted worker/service.

Jobs survive request completion, not process loss. A crash/failure requires a new link request;
credentials remain unverified. This intentionally provides no durable-delivery guarantee.
"""

import logging
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor, wait
from threading import BoundedSemaphore, Lock
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

from ..errors import unavailable

log = logging.getLogger("dzirent.auth.delivery")


class Ticket:
    def __init__(self, dispatcher: "DeliveryDispatcher") -> None:
        self.dispatcher = dispatcher
        self.work: Callable[[], None] | None = None
        self.released = False
        self.lock = Lock()

    def release(self, _: Any = None) -> None:
        with self.lock:
            if not self.released:
                self.released = True
                self.dispatcher.capacity.release()

    def submit(self) -> None:
        if self.work is None:
            self.release()
            return
        self.dispatcher.submit(self)


class DeliveryDispatcher:
    def __init__(self, capacity: int = 16) -> None:
        self.capacity = BoundedSemaphore(capacity)
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="dzirent-mail")
        self.futures: set[Future[None]] = set()
        self.lock = Lock()
        self.closed = False

    def reserve(self) -> Ticket:
        with self.lock:
            if self.closed or not self.capacity.acquire(blocking=False):
                raise unavailable("Email delivery capacity is temporarily unavailable.")
        return Ticket(self)

    def submit(self, ticket: Ticket) -> None:
        def deliver() -> None:
            try:
                if ticket.work is not None:
                    ticket.work()
            except Exception:
                # Never log recipient/link/token, SMTP exception text or private request data.
                log.warning("post_commit_delivery_failed")

        with self.lock:
            if self.closed:
                ticket.release()
                return
            future = self.executor.submit(deliver)
            self.futures.add(future)

        def done(completed: Future[None]) -> None:
            ticket.release()
            with self.lock:
                self.futures.discard(completed)

        future.add_done_callback(done)

    def drain(self, timeout: float = 5) -> bool:
        """Bounded local test/shutdown observation; never a public endpoint."""
        with self.lock:
            futures = set(self.futures)
        return not wait(futures, timeout=timeout).not_done

    def close(self) -> None:
        with self.lock:
            self.closed = True
        self.executor.shutdown(wait=False, cancel_futures=True)


def reserve_after_commit(session: Session) -> Ticket:
    # No mail scheduling inside savepoints: an outer commit must never publish a
    # token whose nested transaction rolled back. Current auth routes use one root.
    if session.in_nested_transaction():
        raise unavailable("Email delivery requires a root transaction.")
    dispatcher = session.info.get("auth_delivery")
    if not isinstance(dispatcher, DeliveryDispatcher):
        raise unavailable("Email delivery dispatcher is not configured.")
    if not session.in_transaction():
        session.begin()  # Ensure even a no-op request/early rollback releases its slot.
    ticket = dispatcher.reserve()
    session.info.setdefault("auth_mail_tickets", []).append(ticket)
    if not session.info.get("auth_mail_events"):
        session.info["auth_mail_events"] = True

        def committed(current: Session) -> None:
            if not current.in_nested_transaction():
                for pending in current.info.pop("auth_mail_tickets", []):
                    pending.submit()

        def ended(current: Session, transaction: Any) -> None:
            if transaction.parent is None:
                for pending in current.info.pop("auth_mail_tickets", []):
                    pending.release()

        event.listen(session, "after_commit", committed)
        event.listen(session, "after_transaction_end", ended)
    return ticket
