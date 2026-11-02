/** Compare the browser Origin with the public request host; NextURL can normalize
 * loopback hosts and deployments can sit behind Vercel's trusted proxy. */
export function sameOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    const host = (
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      ""
    )
      .split(",")[0]
      .trim();
    const protocol = (
      request.headers.get("x-forwarded-proto") ||
      new URL(request.url).protocol.replace(":", "")
    )
      .split(",")[0]
      .trim();
    return (
      ["http:", "https:"].includes(origin.protocol) &&
      origin.host === host &&
      origin.protocol === protocol + ":"
    );
  } catch {
    return false;
  }
}
