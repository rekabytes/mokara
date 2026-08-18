import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.coerce.number().int().positive().default(4200),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  AUTH_SECRET: z.string().default(""),
  ENV: z.enum(["development", "production"]).default("development"),
});

export const env = EnvSchema.parse(process.env);
export const isProd = env.ENV === "production";
