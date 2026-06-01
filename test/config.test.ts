import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("requires WEBHOOK_SECRET", () => {
    expect(() => loadConfig({})).toThrow("WEBHOOK_SECRET");
  });

  it("requires WEBHOOK_SECRET to be at least 32 characters", () => {
    expect(() => loadConfig({ WEBHOOK_SECRET: "short" })).toThrow(
      "WEBHOOK_SECRET must be at least 32 characters"
    );
  });

  it("loads defaults", () => {
    expect(
      loadConfig({
        WEBHOOK_SECRET: "x".repeat(32)
      })
    ).toEqual({
      WEBHOOK_SECRET: "x".repeat(32),
      DOCKER_HOST: "unix:///var/run/docker.sock",
      DOCKER_CONFIG_FILE: "/config.json",
      HOST: "0.0.0.0",
      PORT: 4665
    });
  });

  it("loads DOCKER_HOST when provided", () => {
    expect(
      loadConfig({
        WEBHOOK_SECRET: "x".repeat(32),
        DOCKER_HOST: "unix:///socket/docker.sock"
      }).DOCKER_HOST
    ).toBe("unix:///socket/docker.sock");
  });
});
