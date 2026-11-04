"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
import {
  workflow,
  type Profile,
  type PrivateProfile,
  type SettingsData,
} from "@/lib/workflows";
import { MeasurementsEditor } from "./measurements-editor";
import { StudioEditor } from "./studio-editor";
import { WorkflowModal } from "./workflow-ui";

export type SetupItemId = "location" | "measurements" | "studio" | "first_piece";

export type SetupItem = {
  id: SetupItemId;
  title: string;
};

export function setupItems(canLend: boolean): SetupItem[] {
  const items: SetupItem[] = [
    { id: "location", title: "Set your location (City, ST)" },
    { id: "measurements", title: "Add your measurements" },
  ];
  if (canLend) {
    items.push(
      { id: "studio", title: "Set up your studio" },
      { id: "first_piece", title: "List your first piece" },
    );
  }
  return items;
}

export function hasAnyBodyMeasurement(p: PrivateProfile | null | undefined): boolean {
  if (!p) return false;
  return [
    p.chest_cm,
    p.waist_cm,
    p.hips_cm,
    p.shoulder_cm,
    p.height_cm,
    p.inseam_cm,
  ].some((v) => typeof v === "number" && v > 0);
}

export type SetupStatus = {
  location: boolean;
  measurements: boolean;
  studio: boolean;
  firstPiece: boolean;
};

export function WelcomeChecklistModal({
  profile,
  initialSettings,
  onOpenLocation,
  onStartGuide,
  onClose,
}: {
  profile: Profile;
  initialSettings?: SettingsData | null;
  onOpenLocation: () => void;
  onStartGuide: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsData | null>(
    initialSettings || null,
  );
  const [activeStep, setActiveStep] = useState<"measurements" | "studio" | null>(
    null,
  );

  const canLend = profile.role === "lender" || profile.role === "both";
  const items = setupItems(canLend);

  const refresh = async () => {
    try {
      const data = await workflow<SettingsData>("settings");
      setSettings(data);
    } catch {}
  };

  useEffect(() => {
    if (!settings) {
      Promise.resolve().then(() => {
        void refresh();
      });
    }
  }, [settings]);

  const status: SetupStatus = {
    location: Boolean(profile.city || settings?.profile?.city),
    measurements: hasAnyBodyMeasurement(settings?.privateProfile),
    studio: Boolean(profile.studio_handle || settings?.profile?.studio_handle),
    firstPiece: (settings?.activeListings || 0) > 0,
  };

  const isDone = (item: SetupItem) => {
    switch (item.id) {
      case "location":
        return status.location;
      case "measurements":
        return status.measurements;
      case "studio":
        return status.studio;
      case "first_piece":
        return status.firstPiece;
    }
  };

  const handleItemClick = (item: SetupItem) => {
    switch (item.id) {
      case "location":
        onClose();
        onOpenLocation();
        break;
      case "measurements":
        setActiveStep("measurements");
        break;
      case "studio":
        setActiveStep("studio");
        break;
      case "first_piece":
        onClose();
        router.push("/app/list-a-piece");
        break;
    }
  };

  if (activeStep === "measurements") {
    return (
      <WorkflowModal
        title="My measurements"
        onClose={() => {
          setActiveStep(null);
          void refresh();
        }}
      >
        <MeasurementsEditor initial={settings?.privateProfile || null} />
      </WorkflowModal>
    );
  }

  if (activeStep === "studio") {
    return (
      <WorkflowModal
        title="My studio"
        onClose={() => {
          setActiveStep(null);
          void refresh();
        }}
      >
        <StudioEditor profile={settings?.profile || profile} />
      </WorkflowModal>
    );
  }

  return (
    <dialog
      className="modal welcome-checklist-modal"
      open
      aria-label="Welcome to Dzirent"
      onCancel={onClose}
    >
      <div className="modal-content">
        <div className="modal-top">
          <div>
            <h2>Welcome to Dzirent</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "14px" }}>
              Finish setting up your account
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="checklist-items" style={{ margin: "20px 0" }}>
          {items.map((item) => {
            const done = isDone(item);
            return (
              <button
                type="button"
                key={item.id}
                className={"checklist-row " + (done ? "done" : "")}
                onClick={() => handleItemClick(item)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "14px 0",
                  background: "none",
                  border: "0",
                  borderBottom: "1px solid var(--line, #eee)",
                  textAlign: "left",
                  fontSize: "14px",
                  cursor: "pointer",
                  color: "inherit",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    border: done ? "none" : "2px solid var(--muted, #999)",
                    background: done ? "var(--accent, #9b1c48)" : "transparent",
                    color: "#fff",
                    marginRight: "14px",
                    flexShrink: 0,
                  }}
                >
                  {done && (
                    <Icon
                      name="check"
                      style={{ width: "14px", height: "14px", strokeWidth: "2.5" }}
                    />
                  )}
                </span>
                <span style={{ flex: 1, fontWeight: done ? 400 : 500 }}>
                  {item.title}
                </span>
                <Icon
                  name="chevron"
                  style={{ width: "16px", height: "16px", color: "var(--muted, #888)" }}
                />
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            className="button full"
            onClick={() => {
              onClose();
              onStartGuide();
            }}
          >
            Show me around
          </button>
          <button
            type="button"
            className="text-button full"
            onClick={onClose}
            style={{ textAlign: "center", padding: "10px" }}
          >
            I&apos;ll do it later
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Small card shown in Profile / Settings until location & measurements are set. */
export function FinishSetupCard({
  userId,
  profile,
  privateProfile,
  onOpenChecklist,
}: {
  userId: string;
  profile: Profile;
  privateProfile: PrivateProfile | null | undefined;
  onOpenChecklist: () => void;
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const isDismissed =
          localStorage.getItem("setup_card_dismissed_" + userId) === "true";
        setDismissed(isDismissed);
      } catch {}
    });
  }, [userId]);

  const hasLocation = Boolean(profile.city);
  const hasMeasurements = hasAnyBodyMeasurement(privateProfile);
  const basicsDone = hasLocation && hasMeasurements;

  if (basicsDone || dismissed) return null;

  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      localStorage.setItem("setup_card_dismissed_" + userId, "true");
    } catch {}
    setDismissed(true);
  };

  return (
    <div
      onClick={onOpenChecklist}
      className="finish-setup-card"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--paper, #f7f6f5)",
        border: "1px solid var(--line, #e5e5e5)",
        borderRadius: "12px",
        padding: "16px 20px",
        marginBottom: "24px",
        cursor: "pointer",
      }}
    >
      <div>
        <strong style={{ display: "block", fontSize: "14px", marginBottom: "3px" }}>
          Finish setting up
        </strong>
        <p style={{ margin: 0, fontSize: "12px", color: "var(--muted, #666)" }}>
          Add your location and measurements to get fit matches.
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          type="button"
          className="icon-button"
          aria-label="Dismiss setup prompt"
          onClick={dismiss}
        >
          <Icon name="close" style={{ width: "16px", height: "16px" }} />
        </button>
      </div>
    </div>
  );
}

/** 5-step interactive tour matching Guide.kt */
export function GuideOverlay({
  canLend,
  onClose,
}: {
  canLend: boolean;
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);

  const steps = [
    {
      selector: ".date-chip",
      title: "Choose dates",
      text: "Pick your dates. You'll only see pieces available then.",
    },
    {
      selector: ".menu-button, .top-account-btn, .desktop-account",
      title: "Menu & Profile",
      text: "Tap here for categories, filters, your profile and settings.",
    },
    {
      selector: ".search-pill, .search-pill input, nav a[href='/search']",
      title: "Search",
      text: "Search for anything by name.",
    },
    {
      selector: '.top-closet-btn, .top-list-btn, nav a[href*="closet"]',
      title: "Closet",
      text: canLend
        ? "Your listings and rentals live here."
        : "Your rentals live here.",
    },
    {
      selector:
        '.top-saved-btn, .top-inbox-btn, nav a[href*="saved"], nav a[href*="messages"]',
      title: "Saved & Messages",
      text: "Pieces and studios you save show up here. Messages are in Inbox.",
    },
  ];

  const current = steps[stepIndex] || steps[0];
  const isLast = stepIndex >= steps.length - 1;

  useEffect(() => {
    const el = document.querySelector(current.selector);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [current.selector]);

  return (
    <div
      className="guide-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="guide-card"
        style={{
          background: "var(--paper, #fff)",
          color: "var(--ink, #111)",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "380px",
          width: "100%",
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
        }}
      >
        <span
          className="eyebrow accent"
          style={{ fontSize: "10px", letterSpacing: "1.5px", marginBottom: "8px" }}
        >
          APP TOUR · STEP {stepIndex + 1} OF {steps.length}
        </span>
        <h3 style={{ fontSize: "18px", margin: "6px 0 10px" }}>{current.title}</h3>
        <p style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--muted, #555)", marginBottom: "20px" }}>
          {current.text}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button type="button" className="text-button" onClick={onClose}>
            Skip
          </button>
          <div style={{ display: "flex", gap: "6px" }}>
            {steps.map((_, i) => (
              <span
                key={i}
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background:
                    i === stepIndex
                      ? "var(--accent, #9b1c48)"
                      : "var(--line, #ddd)",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="button"
            style={{ padding: "8px 18px", minHeight: "36px", fontSize: "13px" }}
            onClick={() => {
              if (isLast) onClose();
              else setStepIndex((i) => i + 1);
            }}
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
