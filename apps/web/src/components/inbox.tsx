"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { activity, workflow, type InboxData } from "@/lib/workflows";
import { browserClient } from "@/lib/supabase/client";
import { photoUrl } from "@/lib/supabase/config";
import { Photo } from "./photo";
import { Empty } from "./cards";
import { Icon } from "./icon";
import { Changed, Notice } from "./workflow-ui";
export function useInboxDot(enabled: boolean) {
  const path = usePathname();
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const refresh = () =>
      workflow<InboxData>("inbox")
        .then((data) => {
          if (!disposed)
            setUnread(
              data.cards.some((c) => c.unread) ||
                activity(data).some((a) => a.isNew),
            );
        })
        .catch(() => {});
    refresh();
    const client = browserClient();
    const channel = client
      .channel("web-inbox-dot",{config:{postgres_changes_options:{wait:true}}})
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rentals" },
        refresh,
      )
      .subscribe();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("dzirent-inbox-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("dzirent-inbox-changed", refresh);
      window.removeEventListener("focus", refresh);
      void client.removeChannel(channel);
    };
  }, [enabled, path]);
  return enabled && unread;
}
export function UnreadDot() {
  return <span className="unread-dot" aria-label="Unread updates" />;
}
export function Inbox({ initial }: { initial: InboxData }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState("Messages");
  const [error, setError] = useState("");
  const [seen, setSeen] = useState(false);
  const [activityMarks, setActivityMarks] = useState<Set<string> | null>(null);
  const refresh = useCallback(async () => {
    try {
      setData(await workflow<InboxData>("inbox"));
      setError("");
    } catch {
      setError("Failed to load your inbox.");
    }
  }, []);
  useEffect(() => {
    const client = browserClient();
    const channel = client
      .channel("web-inbox",{config:{postgres_changes_options:{wait:true}}})
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rentals" },
        () => void refresh(),
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") void refresh();
      });
    const timer = setInterval(refresh, 60000);
    return () => {
      clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [refresh]);
  async function select(next: string) {
    setTab(next);
    if (next === "Messages") {
      setSeen(false);
      setActivityMarks(null);
    }
    if (next === "Activity" && !seen) {
      setActivityMarks(
        new Set(
          activity(data)
            .filter((a) => a.isNew)
            .map((a) => a.id),
        ),
      );
      try {
        await workflow("seen", {});
        setSeen(true);
        await refresh();
        Changed();
      } catch {
        setError("Could not mark Activity as seen.");
      }
    }
  }
  const updates = activity(data);
  return (
    <div className="page-width workflow-page inbox-page">
      <div className="workflow-heading">
        <span className="eyebrow accent">KEEP IN TOUCH</span>
        <h1>Inbox</h1>
      </div>
      <div className="workflow-tabs" role="tablist" aria-label="Inbox">
        {["Messages", "Activity"].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => void select(t)}
          >
            {t}
            {(t === "Messages"
              ? data.cards.some((c) => c.unread)
              : !seen && updates.some((a) => a.isNew)) && <UnreadDot />}
          </button>
        ))}
      </div>
      <Notice message={error} error />
      {error && (
        <button className="text-button" onClick={() => void refresh()}>
          Retry
        </button>
      )}
      <div role="tabpanel" aria-label={tab}>
        {tab === "Messages" ? (
          data.cards.length ? (
            <div className="inbox-list">
              {data.cards.map((c) => (
                <Link
                  className="inbox-row"
                  key={c.id}
                  href={"/app/messages/" + c.id}
                >
                  <div className="inbox-photo">
                    <Photo
                      src={photoUrl(c.cover_photo_path)}
                      alt={c.listing_title || "Listing no longer available"}
                      sizes="80px"
                    />
                  </div>
                  <div className="inbox-copy">
                    <div className="inbox-row-title">
                      <strong>{c.other_name || "Dzirent member"}</strong>
                      {c.unread && <UnreadDot />}
                    </div>
                    <span>
                      {c.listing_title || "Listing no longer available"}
                    </span>
                    <p className="muted truncate">
                      {c.last_message
                        ? (c.last_sender_id === data.me ? "You: " : "") +
                          c.last_message
                        : "No messages yet"}
                    </p>
                  </div>
                  <time dateTime={c.last_message_at || undefined}>
                    {c.last_message_at
                      ? new Date(c.last_message_at).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )
                      : ""}
                  </time>
                  <Icon name="chevron" />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title="No messages yet"
              text="When you message a lender or a renter messages you, your chats show up here."
              href="/"
              label="Browse Home"
            />
          )
        ) : updates.length ? (
          <div className="activity-list">
            {updates.map((a) => (
              <Link
                key={a.id}
                href={"/app/messages/" + a.conversationId}
                className="activity-row"
              >
                <span className="activity-icon">
                  <Icon name="calendar" />
                </span>
                <span>
                  {a.text}
                  <small>
                    {new Date(a.time).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </small>
                </span>
                {(activityMarks ? activityMarks.has(a.id) : a.isNew) && (
                  <UnreadDot />
                )}
                <Icon name="chevron" />
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="No activity yet"
            text="Rental updates and reminders about your chats show up here."
            href="/"
            label="Browse Home"
          />
        )}
      </div>
    </div>
  );
}
