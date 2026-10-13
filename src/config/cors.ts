export type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

/**
 * Builds the CORS origin check from raw env strings.
 *
 * Parsing happens here, not in the env schema: ConfigService.get() returns the
 * raw process.env string for keys that exist there, so values transformed by
 * zod (arrays, RegExp) are not what the app receives at runtime.
 *
 * @param origins comma-separated list, e.g. "http://localhost:5173,https://aerospeak.vercel.app"
 * @param regex optional pattern for preview deployments, e.g. "^https://aerospeak-.*\\.vercel\\.app$"
 */
export function buildCorsOrigin(origins: string | undefined, regex: string | undefined) {
  const allowed = new Set(
    (origins ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const pattern = regex?.trim() ? new RegExp(regex.trim()) : null;

  return (origin: string | undefined, callback: CorsOriginCallback): void => {
    // Requests without Origin (curl, health checks, same-origin GET) are allowed.
    const ok = !origin || allowed.has(origin) || (pattern?.test(origin) ?? false);
    callback(null, ok);
  };
}
