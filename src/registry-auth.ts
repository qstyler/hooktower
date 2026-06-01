import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import type { Logger } from "pino";

type DockerAuthEntry = {
  auth?: string;
  username?: string;
  password?: string;
  email?: string;
  identitytoken?: string;
};

type DockerConfig = {
  auths?: Record<string, DockerAuthEntry>;
};

export type DockerAuthConfig = {
  username?: string;
  password?: string;
  email?: string;
  serveraddress?: string;
  identitytoken?: string;
};

export async function checkDockerConfigFile(
  dockerConfigFile: string,
  logger: Logger
): Promise<void> {
  const exists = await fileExists(dockerConfigFile);

  if (!exists) {
    logger.info(
      { dockerConfigFile },
      "No Docker config file found; registry authentication will not be available"
    );
    return;
  }

  try {
    await access(dockerConfigFile, constants.R_OK);
    logger.info(
      { dockerConfigFile },
      "Docker config file found; registry authentication will be used"
    );
  } catch (error) {
    logger.error(
      { err: error, dockerConfigFile },
      "Docker config file is not readable"
    );
    throw new Error(`Docker config file is not readable at ${dockerConfigFile}`);
  }
}

export async function authForImage(
  image: string,
  dockerConfigFile: string,
  logger?: Logger
): Promise<DockerAuthConfig | undefined> {
  if (!(await fileExists(dockerConfigFile))) {
    logger?.info(
      { image, dockerConfigFile },
      "No Docker config file available for image pull"
    );
    return undefined;
  }

  let parsed: DockerConfig;
  try {
    parsed = JSON.parse(await readFile(dockerConfigFile, "utf8")) as DockerConfig;
  } catch (error) {
    logger?.error(
      { err: error, image, dockerConfigFile },
      "Failed to read Docker config file for registry authentication"
    );
    throw error;
  }

  const registry = registryForImage(image);
  const authEntry = findAuthEntry(parsed.auths ?? {}, registry);

  if (!authEntry) {
    logger?.info(
      { image, registry, dockerConfigFile },
      "No matching registry credentials found"
    );
    return undefined;
  }

  const authConfig = authConfigFromEntry(authEntry.entry, authEntry.serverAddress);
  logger?.info(
    { image, registry, serverAddress: authConfig.serveraddress },
    "Matching registry credentials found"
  );

  return authConfig;
}

export function registryForImage(image: string): string {
  const withoutDigest = image.split("@", 1)[0] ?? image;
  const firstPart = withoutDigest.split("/")[0] ?? "";

  if (
    firstPart.includes(".") ||
    firstPart.includes(":") ||
    firstPart === "localhost"
  ) {
    return firstPart;
  }

  return "index.docker.io";
}

function authConfigFromEntry(
  entry: DockerAuthEntry,
  serverAddress: string
): DockerAuthConfig {
  if (entry.auth) {
    const decoded = Buffer.from(entry.auth, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator >= 0) {
      return {
        username: decoded.slice(0, separator),
        password: decoded.slice(separator + 1),
        email: entry.email,
        serveraddress: serverAddress
      };
    }
  }

  return {
    username: entry.username,
    password: entry.password,
    email: entry.email,
    identitytoken: entry.identitytoken,
    serveraddress: serverAddress
  };
}

function findAuthEntry(
  auths: Record<string, DockerAuthEntry>,
  registry: string
): { entry: DockerAuthEntry; serverAddress: string } | undefined {
  const candidates = registryCandidates(registry);

  for (const [serverAddress, entry] of Object.entries(auths)) {
    if (candidates.has(normalizeRegistry(serverAddress))) {
      return { entry, serverAddress };
    }
  }

  return undefined;
}

function registryCandidates(registry: string): Set<string> {
  const normalized = normalizeRegistry(registry);

  if (isDockerHubRegistry(normalized)) {
    return new Set([
      "docker.io",
      "index.docker.io",
      "registry-1.docker.io",
      "index.docker.io/v1"
    ]);
  }

  return new Set([normalized]);
}

function normalizeRegistry(registry: string): string {
  return registry.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function isDockerHubRegistry(registry: string): boolean {
  return (
    registry === "docker.io" ||
    registry === "index.docker.io" ||
    registry === "registry-1.docker.io"
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
