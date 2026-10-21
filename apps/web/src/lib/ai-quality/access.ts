/** Server-only policy: never expose prototype endpoints on Vercel or staging/production. */
export function photoQualityLocalAllowed(
  environment: string | undefined,
  nodeEnv: string | undefined,
  vercelEnv: string | undefined,
): boolean {
  if (vercelEnv) return false;
  if (environment === "local" || environment === "test") return true;
  return !environment && nodeEnv === "development";
}
