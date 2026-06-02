import { access } from "node:fs/promises";
import Docker from "dockerode";
import type { Logger } from "pino";
import { authForImage } from "./registry-auth.js";

export type RecreateAction = {
  previousContainerId: string;
  newContainerId: string;
  name: string;
  previousImage: string;
  newImage: string;
  status: "recreated";
};

export type UpdateResult = {
  image: string;
  matched: number;
  actions: RecreateAction[];
};

export function createDocker(dockerHost: string): Docker {
  return new Docker(dockerOptions(dockerHost));
}

export async function assertDockerAvailable(
  docker: Docker,
  dockerHost: string,
  logger?: Logger
): Promise<void> {
  const socketPath = unixSocketPath(dockerHost);

  if (socketPath) {
    try {
      await access(socketPath);
    } catch (error) {
      logger?.error(
        { err: error, dockerHost, socketPath },
        "Docker socket check failed"
      );
      throw new Error(`Docker socket is unavailable at ${socketPath}`);
    }
  }

  try {
    await docker.ping();
    logger?.info({ dockerHost }, "Docker connectivity check succeeded");
  } catch (error) {
    const dockerError = new Error(
      `Docker daemon is unreachable through ${dockerHost}: ${errorMessage(error)}`
    );
    logger?.error(
      { err: error, dockerHost },
      "Docker connectivity check failed"
    );
    throw dockerError;
  }
}

export function dockerOptions(dockerHost: string): Docker.DockerOptions {
  const url = new URL(dockerHost);

  if (url.protocol === "unix:") {
    return { socketPath: url.pathname };
  }

  if (url.protocol === "tcp:") {
    return {
      protocol: "http",
      host: url.hostname,
      port: url.port
    };
  }

  if (url.protocol === "http:" || url.protocol === "https:") {
    return {
      protocol: url.protocol.slice(0, -1) as "http" | "https",
      host: url.hostname,
      port: url.port
    };
  }

  throw new Error(`Unsupported DOCKER_HOST protocol: ${url.protocol}`);
}

export async function updateMatchingContainers(
  docker: Docker,
  repository: string,
  tag: string,
  dockerConfigFile: string,
  cleanupImages = false,
  logger?: Logger
): Promise<UpdateResult> {
  const startedAt = Date.now();
  const image = `${repository}:${tag}`;
  logger?.info({ repository, tag }, "Searching for matching containers");

  const containers = await docker.listContainers();
  const matches = containers.filter((container) =>
    imageUsesRepository(container.Image, repository)
  );
  const matchingContainerNames = matches.map((container) =>
    containerName("", container.Names)
  );
  const matchingContainerIds = matches.map((container) => container.Id);

  logger?.info(
    {
      repository,
      tag,
      runningContainers: containers.length,
      matchingContainers: matches.length,
      matchingContainerNames,
      matchingContainerIds
    },
    "Container discovery completed"
  );

  if (matches.length === 0) {
    logger?.info(
      {
        repository,
        tag,
        matchedContainers: 0,
        recreatedContainers: 0,
        durationMs: Date.now() - startedAt
      },
      "Webhook update completed"
    );
    return { image, matched: 0, actions: [] };
  }

  logger?.info({ image, repository, tag }, "Image selected for pull");
  await pullImage(docker, image, dockerConfigFile, logger);

  const actions: RecreateAction[] = [];
  for (const summary of matches) {
    const container = docker.getContainer(summary.Id);
    const details = await container.inspect();
    const name = containerName(details.Name, summary.Names);
    const previousImageId = details.Image;

    logger?.info({ containerId: summary.Id, name }, "Container stop started");
    try {
      await container.stop();
      logger?.info({ containerId: summary.Id, name }, "Container stop completed");
    } catch (error) {
      logger?.error(
        { err: error, containerId: summary.Id, name },
        "Container stop failed"
      );
      throw error;
    }

    logger?.info({ containerId: summary.Id, name }, "Container removal started");
    try {
      await container.remove();
      logger?.info({ containerId: summary.Id, name }, "Container removal completed");
    } catch (error) {
      logger?.error(
        { err: error, containerId: summary.Id, name },
        "Container removal failed"
      );
      throw error;
    }

    logger?.info(
      { containerId: summary.Id, name, image },
      "Container recreation started"
    );
    let created: Docker.Container;
    try {
      created = await docker.createContainer({
        ...details.Config,
        Image: image,
        HostConfig: details.HostConfig,
        NetworkingConfig: networkingConfig(details.NetworkSettings.Networks),
        name
      });
      logger?.info(
        { containerId: created.id, previousContainerId: summary.Id, name, image },
        "Container recreation completed"
      );
    } catch (error) {
      logger?.error(
        { err: error, containerId: summary.Id, name, image },
        "Container creation failed"
      );
      throw error;
    }

    logger?.info({ containerId: created.id, name }, "Container start started");
    try {
      await created.start();
      logger?.info({ containerId: created.id, name }, "Container start completed");
    } catch (error) {
      logger?.error(
        { err: error, containerId: created.id, name },
        "Container start failed"
      );
      throw error;
    }

    if (cleanupImages) {
      try {
        await cleanupReplacedImage(docker, {
          previousImage: summary.Image,
          previousImageId,
          newContainer: created,
          name,
          logger
        });
      } catch (error) {
        logger?.warn(
          {
            err: error,
            image: summary.Image,
            imageId: previousImageId,
            containerId: created.id,
            name,
            reason: errorMessage(error)
          },
          "Image cleanup skipped"
        );
      }
    }

    actions.push({
      previousContainerId: summary.Id,
      newContainerId: created.id,
      name,
      previousImage: summary.Image,
      newImage: image,
      status: "recreated"
    });
  }

  logger?.info(
    {
      repository,
      tag,
      matchedContainers: matches.length,
      recreatedContainers: actions.length,
      durationMs: Date.now() - startedAt
    },
    "Webhook update completed"
  );

  return { image, matched: matches.length, actions };
}

function imageUsesRepository(image: string, repository: string): boolean {
  const withoutDigest = image.split("@", 1)[0] ?? image;
  const withoutTag = withoutDigest.replace(/:[^/:]+$/, "");
  return withoutTag === repository;
}

async function pullImage(
  docker: Docker,
  image: string,
  dockerConfigFile: string,
  logger?: Logger
): Promise<void> {
  logger?.info({ image }, "Image pull started");
  try {
    const authconfig = await authForImage(image, dockerConfigFile, logger);
    const stream = await docker.pull(image, authconfig ? { authconfig } : {});
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(stream, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    logger?.info({ image }, "Image pull completed");
  } catch (error) {
    logger?.error({ err: error, image }, "Image pull failed");
    throw error;
  }
}

async function cleanupReplacedImage(
  docker: Docker,
  {
    previousImage,
    previousImageId,
    newContainer,
    name,
    logger
  }: {
    previousImage: string;
    previousImageId: string;
    newContainer: Docker.Container;
    name: string;
    logger?: Logger;
  }
): Promise<void> {
  const cleanupContext = {
    image: previousImage,
    imageId: previousImageId,
    containerId: newContainer.id,
    name
  };
  logger?.info(cleanupContext, "Image cleanup started");

  if (!previousImageId) {
    logger?.info(
      { ...cleanupContext, reason: "Previous container image ID is unavailable" },
      "Image cleanup skipped"
    );
    return;
  }

  const newDetails = await newContainer.inspect();
  if (newDetails.Image === previousImageId) {
    logger?.info(
      { ...cleanupContext, reason: "Container image was not replaced" },
      "Image cleanup skipped"
    );
    return;
  }

  const runningContainers = await docker.listContainers();
  const runningContainerUsingImage = runningContainers.find(
    (container) => container.ImageID === previousImageId
  );
  if (runningContainerUsingImage) {
    logger?.info(
      {
        ...cleanupContext,
        reason: "Image is still used by a running container",
        runningContainerId: runningContainerUsingImage.Id
      },
      "Image cleanup skipped"
    );
    return;
  }

  try {
    await docker.getImage(previousImageId).remove();
    logger?.info(cleanupContext, "Image cleanup completed");
  } catch (error) {
    logger?.warn(
      { ...cleanupContext, err: error, reason: errorMessage(error) },
      "Image cleanup skipped"
    );
  }
}

function containerName(name: string, names?: string[]): string {
  if (name) {
    return name.replace(/^\//, "");
  }

  return names?.[0]?.replace(/^\//, "") ?? "";
}

function networkingConfig(
  networks: Docker.ContainerInspectInfo["NetworkSettings"]["Networks"]
): Docker.ContainerCreateOptions["NetworkingConfig"] {
  return {
    EndpointsConfig: Object.fromEntries(
      Object.entries(networks ?? {}).map(([networkName, settings]) => [
        networkName,
        {
          Aliases: settings.Aliases,
          Links: settings.Links,
          IPAMConfig: settings.IPAMConfig
        }
      ])
    )
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unixSocketPath(dockerHost: string): string | null {
  const url = new URL(dockerHost);
  return url.protocol === "unix:" ? url.pathname : null;
}
