import Fastify from "fastify";
import type Docker from "dockerode";
import type { Logger } from "pino";
import { ZodError } from "zod";
import type { Config } from "./config.js";
import { webhookPayloadSchema } from "./payload.js";
import { updateMatchingContainers, type UpdateResult } from "./docker.js";

type ServerOptions = {
  config: Config;
  docker: Docker;
  updateContainers?: (
    docker: Docker,
    repository: string,
    tag: string,
    dockerConfigFile: string,
    cleanupImages: boolean,
    logger: Logger
  ) => Promise<UpdateResult>;
  logger: Logger;
};

export function buildServer({
  config,
  docker,
  updateContainers = updateMatchingContainers,
  logger
}: ServerOptions) {
  const app = Fastify({
    disableRequestLogging: true,
    loggerInstance: logger
  });

  app.get("/health", async () => ({ ok: true }));

  app.post<{ Params: { secret: string } }>("/webhook/:secret", async (request, reply) => {
    const sourceIp = request.ip;
    request.log.info({ sourceIp }, "Webhook request received");

    if (request.params.secret !== config.WEBHOOK_SECRET) {
      request.log.warn({ sourceIp }, "Webhook secret validation failed");
      return reply.status(401).send({
        error: "Invalid webhook secret"
      });
    }
    request.log.info({ sourceIp }, "Webhook secret validation succeeded");

    const payloadResult = webhookPayloadSchema.safeParse(request.body);
    if (!payloadResult.success) {
      request.log.warn(
        { sourceIp, err: payloadResult.error },
        "Webhook payload validation failed"
      );
      return reply.status(400).send({
        error: "Invalid webhook payload",
        details: payloadResult.error.issues
      });
    }

    const payload = payloadResult.data;
    const repository = payload.repository.repo_name;
    const tag = payload.push_data.tag;

    request.log.info(
      { sourceIp, repository, tag },
      "Webhook payload validation succeeded"
    );
    request.log.info({ sourceIp, repository, tag }, "Webhook received");

    return updateContainers(
      docker,
      repository,
      tag,
      config.DOCKER_CONFIG_FILE,
      config.HOOKTOWER_CLEANUP,
      request.log
    );
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      request.log.warn({ err: error }, "Webhook validation failed");
      reply.status(400).send({
        error: "Invalid webhook payload",
        details: error.issues
      });
      return;
    }

    request.log.error({ err: error }, "Request failed");
    reply.status(500).send({
      error: errorMessage(error)
    });
  });

  return app;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
