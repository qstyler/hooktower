import { ZodError } from "zod";
import { loadConfig } from "./config.js";
import { assertDockerAvailable, createDocker } from "./docker.js";
import { logger } from "./logger.js";
import { checkDockerConfigFile } from "./registry-auth.js";
import { buildServer } from "./server.js";
import { appVersion } from "./version.js";

async function main() {
  const config = loadConfig();
  const customDockerHostProvided = Boolean(process.env.DOCKER_HOST);

  logger.info(
    {
      version: appVersion,
      port: config.PORT,
      dockerHost: config.DOCKER_HOST,
      dockerHostSource: customDockerHostProvided ? "custom" : "default",
      dockerConfigFile: config.DOCKER_CONFIG_FILE
    },
    "Hooktower starting"
  );

  await checkDockerConfigFile(config.DOCKER_CONFIG_FILE, logger);

  const docker = createDocker(config.DOCKER_HOST);

  await assertDockerAvailable(docker, config.DOCKER_HOST, logger);

  const server = buildServer({ config, docker, logger });
  await server.listen({
    host: config.HOST,
    port: config.PORT
  });
}

main().catch((error) => {
  const message =
    error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join("; ")
      : error instanceof Error
        ? error.message
        : String(error);

  logger.error(
    {
      err: error,
      version: appVersion
    },
    `Hooktower startup failed: ${message}`
  );
  process.exit(1);
});
