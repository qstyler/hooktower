import { describe, expect, it } from "vitest";
import { dockerOptions } from "../src/docker.js";

describe("dockerOptions", () => {
  it("maps unix DOCKER_HOST values to a Docker socket path", () => {
    expect(dockerOptions("unix:///var/run/docker.sock")).toEqual({
      socketPath: "/var/run/docker.sock"
    });
  });

  it("maps tcp DOCKER_HOST values to Dockerode HTTP options", () => {
    expect(dockerOptions("tcp://docker.example.test:2375")).toEqual({
      protocol: "http",
      host: "docker.example.test",
      port: "2375"
    });
  });

  it("rejects unsupported protocols", () => {
    expect(() => dockerOptions("ftp://docker.example.test")).toThrow(
      "Unsupported DOCKER_HOST protocol"
    );
  });
});
