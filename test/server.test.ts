import { describe, expect, it, vi } from "vitest";
import type Docker from "dockerode";
import pino from "pino";
import { buildServer } from "../src/server.js";
import type { Config } from "../src/config.js";

const logger = pino({ enabled: false });

const config: Config = {
  WEBHOOK_SECRET: "x".repeat(32),
  DOCKER_HOST: "unix:///var/run/docker.sock",
  DOCKER_CONFIG_FILE: "/config.json",
  HOOKTOWER_CLEANUP: false,
  HOST: "0.0.0.0",
  PORT: 4665
};

describe("webhook route", () => {
  it("returns 401 when the secret is invalid", async () => {
    const app = buildServer({
      config,
      docker: {} as Docker,
      logger
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhook/wrong",
      payload: {}
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "Invalid webhook secret"
    });

    await app.close();
  });

  it("returns 400 when the payload is invalid", async () => {
    const app = buildServer({
      config,
      docker: {} as Docker,
      logger
    });

    const response = await app.inject({
      method: "POST",
      url: `/webhook/${config.WEBHOOK_SECRET}`,
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("Invalid webhook payload");

    await app.close();
  });

  it("updates matching containers from a valid payload", async () => {
    const updateContainers = vi.fn().mockResolvedValue({
      image: "kostia/gearbot:latest",
      matched: 1,
      actions: [
        {
          previousContainerId: "abc123",
          newContainerId: "def456",
          name: "gearbot",
          previousImage: "kostia/gearbot:old",
          newImage: "kostia/gearbot:latest",
          status: "recreated"
        }
      ]
    });
    const docker = {} as Docker;
    const app = buildServer({
      config,
      docker,
      updateContainers,
      logger
    });

    const response = await app.inject({
      method: "POST",
      url: `/webhook/${config.WEBHOOK_SECRET}`,
      payload: {
        push_data: {
          tag: "latest"
        },
        repository: {
          repo_name: "kostia/gearbot"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().image).toBe("kostia/gearbot:latest");
    expect(updateContainers).toHaveBeenCalledWith(
      docker,
      "kostia/gearbot",
      "latest",
      "/config.json",
      false,
      expect.any(Object)
    );

    await app.close();
  });
});
