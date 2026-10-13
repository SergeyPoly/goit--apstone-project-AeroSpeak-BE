import { z } from 'zod';

/**
 * Environment variables, validated at startup.
 * The app refuses to start if a required variable is missing or malformed.
 *
 * Note: ConfigService.get() returns the raw process.env string for keys present
 * there, so do not rely on zod transforms here; parse values where they are used.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),
  // Used only by Prisma CLI (migrations); optional for the running app.
  DIRECT_URL: z.string().url().optional(),

  DEEPGRAM_API_KEY: z.string().min(1),
  DEEPGRAM_MODEL: z.string().default('nova-3'),

  // Kept as raw strings on purpose: parsed by buildCorsOrigin() in config/cors.ts.
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  CORS_ORIGIN_REGEX: z
    .string()
    .optional()
    .refine((value) => {
      if (!value?.trim()) return true;
      try {
        new RegExp(value);
        return true;
      } catch {
        return false;
      }
    }, 'must be a valid regular expression'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
