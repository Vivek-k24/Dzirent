import { Icon } from "./icon";

/**
 * C6: the "Verified" badge. The person verified their ID once; the shop window says only that
 * (is_verified / other_is_verified), never a name or anything from the ID.
 */
export function VerifiedBadge({ verified, className = "" }: { verified: boolean | null | undefined; className?: string }) {
  if (!verified) return null;
  return (
    <span className={("verified-badge " + className).trim()} title="ID verified with Dzirent">
      <Icon name="check" />
      Verified
    </span>
  );
}
