import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authForImage, registryForImage } from "../src/registry-auth.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hooktower-auth-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("registryForImage", () => {
  it("uses Docker Hub for implicit registry images", () => {
    expect(registryForImage("kostia/gearbot:latest")).toBe("index.docker.io");
  });

  it("extracts explicit registries", () => {
    expect(registryForImage("ghcr.io/kostia/gearbot:latest")).toBe("ghcr.io");
  });
});

describe("authForImage", () => {
  it("returns undefined when the Docker config file does not exist", async () => {
    await expect(
      authForImage("kostia/gearbot:latest", join(tempDir, "missing.json"))
    ).resolves.toBeUndefined();
  });

  it("loads matching Docker Hub auth credentials", async () => {
    const configFile = join(tempDir, "config.json");
    await writeFile(
      configFile,
      JSON.stringify({
        auths: {
          "https://index.docker.io/v1/": {
            auth: Buffer.from("hooktower:swordfish").toString("base64")
          }
        }
      })
    );

    await expect(authForImage("kostia/gearbot:latest", configFile)).resolves.toEqual({
      username: "hooktower",
      password: "swordfish",
      serveraddress: "https://index.docker.io/v1/"
    });
  });

  it("loads matching explicit registry auth credentials", async () => {
    const configFile = join(tempDir, "config.json");
    await writeFile(
      configFile,
      JSON.stringify({
        auths: {
          "ghcr.io": {
            username: "hooktower",
            password: "swordfish"
          }
        }
      })
    );

    await expect(authForImage("ghcr.io/kostia/gearbot:latest", configFile)).resolves.toEqual({
      username: "hooktower",
      password: "swordfish",
      serveraddress: "ghcr.io"
    });
  });
});
