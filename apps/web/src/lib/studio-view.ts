// F1: what a studio page offers. On someone else's studio: Save, Share, and Studio options
// (Report this studio, Block this studio). On your own: Share and Edit studio, never Save,
// Report or Block (the database also ignores a self-block or self-report, and refuses one
// written to the tables directly). The same rule as the app (shared util/Studio.kt).

export type StudioActions = {
  save: boolean;
  share: boolean;
  /** The "Studio options" disclosure with Report this studio and Block this studio. */
  report: boolean;
  block: boolean;
  edit: boolean;
};

const handleKey = (handle: string | null | undefined) => (handle ?? "").trim().toLowerCase();

/** True when the signed-in person's own handle is this studio's (handles ignore case). */
export function isOwnStudio(viewerHandle: string | null | undefined, studioHandle: string | null | undefined): boolean {
  const mine = handleKey(viewerHandle);
  return mine !== "" && mine === handleKey(studioHandle);
}

export function studioActions(own: boolean): StudioActions {
  return own
    ? { save: false, share: true, report: false, block: false, edit: true }
    : { save: true, share: true, report: true, block: true, edit: false };
}

/** Where Edit studio goes: Settings > My studio. */
export const EDIT_STUDIO_PATH = "/app/settings/studio";
