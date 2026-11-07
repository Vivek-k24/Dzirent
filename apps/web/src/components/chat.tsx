"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { browserClient } from "@/lib/supabase/client";
import { photoUrl } from "@/lib/supabase/config";
import { price, type BrowseContext } from "@/lib/types";
import {
  dateRange,
  dateChip,
  workflow,
  WorkflowClientError,
  reportReasons,
  safetyTip,
  isoToday,
  type ChatData,
  type Message,
} from "@/lib/workflows";
import { WorkflowModal, Notice, Changed } from "./workflow-ui";
import { Photo } from "./photo";
import { Icon } from "./icon";
export function Chat({
  initial,
  ctx,
}: {
  initial: ChatData;
  ctx: BrowseContext;
}) {
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<
    "dates" | "rental" | "report" | "block" | "cancel_deal" | null
  >(null);
  const [reportId, setReportId] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportDetailsError, setReportDetailsError] = useState("");
  const [notice, setNotice] = useState("");
  const [safety, setSafety] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const id = initial.conversation.id;
  const renter = data.conversation.renter_id === data.me;
  const other = data.card?.other_name || "Dzirent member";
  function openReport(msgId: string) {
    setReportId(msgId);
    setReportDetails("");
    setReportDetailsError("");
    setError("");
    setModal("report");
  }
  const read = useCallback(async () => {
    try {
      await workflow("chat/" + id + "/read", {});
      Changed();
    } catch {
      /* Refreshing retries the read receipt. */
    }
  }, [id]);
  const refresh = useCallback(async () => {
    try {
      const next = await workflow<ChatData>("chat/" + id);
      setData((old) => ({
        ...next,
        messages: [
          ...new Map(
            [...old.messages, ...next.messages].map((m) => [m.id, m]),
          ).values(),
        ].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }));
      await read();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, read]);
  useEffect(() => {
    let disposed = false;
    const client = browserClient();
    const channel = client
      .channel("web-chat-" + id,{config:{postgres_changes_options:{wait:true}}})
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "conversation_id=eq." + id,
        },
        (payload) => {
          if (disposed) return;
          const m = payload.new as Message;
          setData((old) => ({
            ...old,
            messages: [
              ...new Map([...old.messages, m].map((m) => [m.id, m])).values(),
            ].sort((a, b) => a.created_at.localeCompare(b.created_at)),
          }));
          if (m.sender_id !== initial.me) void read();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rentals",
          filter: "conversation_id=eq." + id,
        },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });
    const initialLoad = setTimeout(refresh, 2500);
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      clearTimeout(initialLoad);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      void client.removeChannel(channel);
    };
  }, [id, initial.me, read, refresh]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [data.messages.length]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (localStorage.getItem("dzirent-safety-" + id)) setSafety(false);
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, [id]);
  async function action(path: string, body: object) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await workflow("chat/" + id + "/" + path, body);
      await refresh();
      setModal(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const browseDates = dateChip(ctx.start, ctx.end);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    const message = draft.trim();
    setBusy(true);
    setError("");
    setSendError("");
    try {
      const m = await workflow<Message>("chat/" + id + "/send", { message });
      setData((old) => ({
        ...old,
        messages: [
          ...new Map([...old.messages, m].map((m) => [m.id, m])).values(),
        ].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }));
      setDraft("");
      Changed();
      if (renter && message.includes(browseDates)) {
        try {
          await workflow("chat/" + id + "/dates", {
            start: ctx.start,
            end: ctx.end,
          });
          await refresh();
        } catch {
          setError(
            "Message sent. Could not change your dates. Please try Change dates.",
          );
        }
      }
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rental = data.rental;
  const prompt =
    !rental &&
    !data.outcome &&
    data.now - Date.parse(data.conversation.created_at) >= 3 * 86400000;
  return (
    <div className="page-width workflow-page chat-page">
      <div className="chat-top">
        <Link href="/app/messages" className="text-link">
          <span aria-hidden="true">←</span> Inbox
        </Link>
        <div>
          <h1>{other}</h1>
          <span className="muted">Arrange the details together</span>
        </div>
        <details ref={menuRef} className="chat-menu">
          <summary className="icon-button" aria-label="Conversation menu">
            <Icon name="more" />
          </summary>
          <div>
            <button
              onClick={() => {
                menuRef.current?.removeAttribute("open");
                openReport("");
              }}
            >
              Report user
            </button>
            <button
              disabled={busy}
              onClick={() => {
                menuRef.current?.removeAttribute("open");
                if (data.blocked) {
                  void action("block", { blocked: false });
                } else {
                  setModal("block");
                }
              }}
            >
              {data.blocked ? "Unblock user" : "Block user"}
            </button>
          </div>
        </details>
      </div>
      <Link
        className="chat-listing"
        href={"/listing/" + data.conversation.listing_id}
      >
        <div className="chat-thumb">
          <Photo
            src={photoUrl(data.card?.cover_photo_path || null)}
            alt={data.card?.listing_title || "Listing no longer available"}
            sizes="64px"
          />
        </div>
        <div>
          <strong>
            {data.card?.listing_title || "Listing no longer available"}
          </strong>
          <p>{price(data.card?.price ?? null)}</p>
        </div>
        <Icon name="chevron" />
      </Link>
      <div className="chat-dates">
        <Icon name="calendar" />
        <span>
          {renter ? "Your dates: " : "Their dates: "}
          {dateChip(
            data.conversation.requested_start,
            data.conversation.requested_end,
          )}
        </span>
        {renter && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setModal("dates")}
          >
            Change dates
          </button>
        )}
      </div>
      {safety && (
        <div className="policy-note chat-safety">
          <span>{safetyTip}</span>
          <button
            className="icon-button"
            aria-label="Dismiss safety tip"
            onClick={() => {
              setSafety(false);
              try {
                localStorage.setItem("dzirent-safety-" + id, "1");
              } catch {}
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {rental && (
        <div className="rental-banner">
          <strong>
            {rental.status === "cancelled"
              ? "Deal didn't happen"
              : rental.status === "active"
                ? "Rented · " + dateRange(rental.start_date, rental.end_date)
                : "Returned · " + dateRange(rental.start_date, rental.end_date)}
          </strong>
          <small>
            Marked by {rental.updated_by === data.me ? "you" : other}
          </small>
        </div>
      )}
      <div
        className="message-history"
        role="log"
        aria-label="Messages"
        aria-live="polite"
      >
        {data.messages.length ? (
          data.messages.map((m) => (
            <div
              key={m.id}
              className={
                "message-wrap " + (m.sender_id === data.me ? "own" : "incoming")
              }
            >
              <div className="message-bubble">
                <p>{m.body}</p>
                <time dateTime={m.created_at}>
                  {new Date(m.created_at).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              {m.sender_id !== data.me && (
                <button
                  className="text-button message-report"
                  aria-label="Report message"
                  onClick={() => {
                    openReport(m.id);
                  }}
                >
                  <Icon name="more" />
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="chat-empty">
            <Icon name="message" />
            <h2>No messages yet</h2>
            {renter && (
              <div className="suggestion-chips">
                {[
                  "Is this available " + browseDates + "?",
                  "Can I see more photos?",
                ].map((t) => (
                  <button key={t} onClick={() => setDraft(t)}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>
      {prompt && (
        <div className="rental-followup">
          <strong>Did this rental happen?</strong>
          <p>
            Your answer helps us improve Dzirent. Only you see this question.
          </p>
          <div className="button-row">
            <button
              className="button compact"
              disabled={busy}
              onClick={() => setModal("rental")}
            >
              Yes
            </button>
            <button
              className="button secondary compact"
              disabled={busy}
              onClick={() => void action("rental", { status: "no" })}
            >
              No
            </button>
          </div>
        </div>
      )}
      <Notice message={error} error />
      <Notice message={notice} />
      {data.mySuspension ? (
        <div className="policy-note notice error" style={{ margin: "16px 0" }}>
          <strong>{data.mySuspension}</strong>
        </div>
      ) : data.blocked ? (
        <div className="blocked-banner">
          <strong>You blocked this user</strong>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void action("block", { blocked: false })}
          >
            Unblock
          </button>
        </div>
      ) : (
        <>
          <form className="message-composer" onSubmit={send}>
            <label className="sr-only" htmlFor="message-body">
              Message
            </label>
            <textarea
              id="message-body"
              placeholder="Message..."
              maxLength={2000}
              rows={2}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (sendError) setSendError("");
              }}
              disabled={busy}
            />
            <button className="button" disabled={busy || !draft.trim()}>
              <Icon name="arrow" />
              <span>Send</span>
            </button>
          </form>
          {sendError && (
            <p
              role="alert"
              className="form-message error"
              style={{
                margin: "6px 0 0",
                fontSize: "13px",
                color: "var(--danger, #d32f2f)",
              }}
            >
              {sendError}
            </p>
          )}
        </>
      )}
      <div className="rental-actions">
        <button
          className="text-button"
          disabled={busy}
          onClick={() => setModal("rental")}
        >
          {rental?.status === "active"
            ? "Change rental dates"
            : "Mark as rented"}
        </button>
        {rental?.status === "active" && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void action("rental", { status: "returned" })}
          >
            Mark as returned
          </button>
        )}
        {(!rental || rental.status === "active") && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setModal("cancel_deal")}
          >
            Deal didn&apos;t happen
          </button>
        )}
      </div>
      {(modal === "dates" || modal === "rental") && (
        <WorkflowModal
          title={modal === "dates" ? "Your dates" : "Rental dates"}
          busy={busy}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await action(modal === "dates" ? "dates" : "rental", {
                status: "active",
                start: f.get("start"),
                end: f.get("end"),
              });
            }}
          >
            <div className="form-pair">
              <label className="field">
                <span>From</span>
                <input
                  type="date"
                  name="start"
                  min={modal === "dates" ? isoToday() : undefined}
                  defaultValue={
                    (modal === "rental"
                      ? rental?.start_date
                      : data.conversation.requested_start) || ctx.start
                  }
                  required
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span>To</span>
                <input
                  type="date"
                  name="end"
                  min={modal === "dates" ? isoToday() : undefined}
                  defaultValue={
                    (modal === "rental"
                      ? rental?.end_date
                      : data.conversation.requested_end) || ctx.end
                  }
                  required
                  disabled={busy}
                />
              </label>
            </div>
            <Notice message={error} error />
            <button className="button full" disabled={busy}>
              {modal === "dates" ? "Change dates" : "Mark as rented"}
            </button>
          </form>
        </WorkflowModal>
      )}
      {modal === "report" && (
        <WorkflowModal
          title={reportId ? "Report message" : "Report user"}
          busy={busy}
          onClose={() => setModal(null)}
        >
          {data.mySuspension ? (
            <div className="policy-note notice error" style={{ margin: "16px 0" }}>
              <p><strong>{data.mySuspension}</strong></p>
            </div>
          ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              setReportDetailsError("");
              try {
                await workflow("chat/" + id + "/report", {
                  messageId: reportId,
                  reason: f.get("reason"),
                  details: reportDetails,
                });
                await refresh();
                setModal(null);
                setNotice("Report sent. Thanks. We'll review this.");
              } catch (err) {
                const errorObj =
                  err instanceof WorkflowClientError ? err : (err as Error);
                if (
                  err instanceof WorkflowClientError &&
                  err.field === "details"
                ) {
                  setReportDetailsError(err.message);
                } else {
                  setError(errorObj.message);
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>Reason</span>
              <select name="reason" required disabled={busy}>
                {reportReasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Details (optional)</span>
              <textarea
                name="details"
                maxLength={500}
                rows={4}
                value={reportDetails}
                onChange={(e) => {
                  setReportDetails(e.target.value);
                  if (reportDetailsError) setReportDetailsError("");
                }}
                disabled={busy}
              />
              {reportDetailsError && (
                <p
                  role="alert"
                  className="form-message error"
                  style={{
                    margin: "4px 0 0",
                    fontSize: "13px",
                    color: "var(--danger, #d32f2f)",
                  }}
                >
                  {reportDetailsError}
                </p>
              )}
            </label>
            <Notice message={error} error />
            <button className="button full" disabled={busy}>
              Send report
            </button>
          </form>
          )}
        </WorkflowModal>
      )}
      {modal === "block" && (
        <WorkflowModal
          title="Block user?"
          busy={busy}
          onClose={() => setModal(null)}
        >
          <p>
            You won’t be able to message each other, and pending deals will be
            canceled.
          </p>
          <Notice message={error} error />
          <div className="button-row">
            <button
              className="button danger-button"
              disabled={busy}
              onClick={async () => {
                await action("block", { blocked: true });
              }}
            >
              Block user
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
          </div>
        </WorkflowModal>
      )}
      {modal === "cancel_deal" && (
        <WorkflowModal
          title="Deal didn't happen?"
          busy={busy}
          onClose={() => setModal(null)}
        >
          <p>
            Mark this deal as cancelled. You and the other member will still be
            able to message each other.
          </p>
          <Notice message={error} error />
          <div className="button-row">
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                await action("rental", { status: "cancelled" });
              }}
            >
              Cancel deal
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              Keep deal
            </button>
          </div>
        </WorkflowModal>
      )}
    </div>
  );
}
