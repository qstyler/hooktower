import { z } from "zod";

export const defaultDockerHost = "unix:///var/run/docker.sock";
export const defaultDockerConfigFile = "/config.json";

const envSchema = z.object({
  WEBHOOK_SECRET: z
    .string({
      error: "WEBHOOK_SECRET is required"
    })
    .min(32, "WEBHOOK_SECRET must be at least 32 characters"),
  DOCKER_HOST: z.string().min(1).default(defaultDockerHost),
  DOCKER_CONFIG_FILE: z.string().min(1).default(defaultDockerConfigFile),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4665)
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
