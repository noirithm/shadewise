import { z } from "zod";

const Schema = z.object({
  YOUCAM_API_KEY: z.string().min(10, "is missing or too short"),
  YOUCAM_API_BASE: z.string().default("https://yce-api-01.makeupar.com"),
  ALLOWED_ORIGINS: z.string().default(""),
});

export interface ServerConfig {
  apiKey: string;
  apiBase: string;
  allowedOrigins: string[];
}

/** Errors name the variable that is wrong, never its value. */
export function loadServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const r = Schema.safeParse(env);
  if (!r.success) {
    throw new Error(
      "Server configuration invalid: " + r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "),
    );
  }
  return {
    apiKey: r.data.YOUCAM_API_KEY,
    apiBase: r.data.YOUCAM_API_BASE.replace(/\/$/, ""),
    allowedOrigins: r.data.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  };
}
