import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  CRON_SECRET: z.string().min(16).optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(12),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(10),
  OCR_PROVIDER: z.enum(["mock", "azure", "none"]).default("mock"),
  AZURE_DI_ENDPOINT: z.string().optional(),
  AZURE_DI_KEY: z.string().optional(),
  EMAIL_DRIVER: z.enum(["console", "smtp", "none"]).default("console"),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("Expenses <no-reply@example.com>"),
  FX_PROVIDER: z.enum(["ecb", "none"]).default("ecb"),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
