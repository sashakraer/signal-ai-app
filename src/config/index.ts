import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().optional(),

  // Salesforce
  SF_CLIENT_ID: z.string().optional(),
  SF_PRIVATE_KEY: z.string().optional(),
  SF_USERNAME: z.string().optional(),
  SF_INSTANCE_URL: z.string().url().optional(),

  // Microsoft Graph
  MS_TENANT_ID: z.string().optional(),
  MS_CLIENT_ID: z.string().optional(),
  MS_CLIENT_SECRET: z.string().optional(),

  // WhatsApp
  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_API_KEY: z.string().optional(),
  WA_BUSINESS_ACCOUNT_ID: z.string().optional(),

  // App
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  APP_URL: z.string().url().default("http://localhost:3000"),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
