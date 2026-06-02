import { describe, expect, it, vi } from "vitest";
import { dockerOptions } from "../src/docker.js";
import { updateMatchingContainers } from "../src/docker.js";

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

describe("updateMatchingContainers cleanup", () => {
  it("removes the previous image after a successful replacement", async () => {
    const previousContainer = container({
      inspect: {
        Id: "old-container",
        Name: "/gearbot",
        Image: "sha256:old",
        Config: {},
        HostConfig: {},
        NetworkSettings: { Networks: {} }
      }
    });
    const createdContainer = container({
      id: "new-container",
      inspect: { Image: "sha256:new" }
    });
    const removeImage = vi.fn().mockResolvedValue(undefined);
    const docker = dockerClient({
      containers: [
        {
          Id: "old-container",
          Names: ["/gearbot"],
          Image: "kostia/gearbot:v1",
          ImageID: "sha256:old"
        }
      ],
      afterRecreateContainers: [
        {
          Id: "new-container",
          Names: ["/gearbot"],
          Image: "kostia/gearbot:v2",
          ImageID: "sha256:new"
        }
      ],
      getContainer: previousContainer,
      createContainer: createdContainer,
      removeImage
    });

    await updateMatchingContainers(
      docker,
      "kostia/gearbot",
      "v2",
      "/config.json",
      true
    );

    expect(removeImage).toHaveBeenCalledWith("sha256:old");
  });

  it("skips cleanup when the recreated container still uses the same image ID", async () => {
    const previousContainer = container({
      inspect: {
        Id: "old-container",
        Name: "/gearbot",
        Image: "sha256:same",
        Config: {},
        HostConfig: {},
        NetworkSettings: { Networks: {} }
      }
    });
    const createdContainer = container({
      id: "new-container",
      inspect: { Image: "sha256:same" }
    });
    const removeImage = vi.fn().mockResolvedValue(undefined);
    const docker = dockerClient({
      containers: [
        {
          Id: "old-container",
          Names: ["/gearbot"],
          Image: "kostia/gearbot:v1",
          ImageID: "sha256:same"
        }
      ],
      getContainer: previousContainer,
      createContainer: createdContainer,
      removeImage
    });

    await updateMatchingContainers(
      docker,
      "kostia/gearbot",
      "v2",
      "/config.json",
      true
    );

    expect(removeImage).not.toHaveBeenCalled();
  });

  it("skips cleanup when another running container uses the previous image", async () => {
    const previousContainer = container({
      inspect: {
        Id: "old-container",
        Name: "/gearbot",
        Image: "sha256:old",
        Config: {},
        HostConfig: {},
        NetworkSettings: { Networks: {} }
      }
    });
    const createdContainer = container({
      id: "new-container",
      inspect: { Image: "sha256:new" }
    });
    const removeImage = vi.fn().mockResolvedValue(undefined);
    const docker = dockerClient({
      containers: [
        {
          Id: "old-container",
          Names: ["/gearbot"],
          Image: "kostia/gearbot:v1",
          ImageID: "sha256:old"
        }
      ],
      afterRecreateContainers: [
        {
          Id: "other-container",
          Names: ["/other"],
          Image: "kostia/gearbot:v1",
          ImageID: "sha256:old"
        },
        {
          Id: "new-container",
          Names: ["/gearbot"],
          Image: "kostia/gearbot:v2",
          ImageID: "sha256:new"
        }
      ],
      getContainer: previousContainer,
      createContainer: createdContainer,
      removeImage
    });

    await updateMatchingContainers(
      docker,
      "kostia/gearbot",
      "v2",
      "/config.json",
      true
    );

    expect(removeImage).not.toHaveBeenCalled();
  });

  it("keeps the update successful when Docker refuses image removal", async () => {
    const previousContainer = container({
      inspect: {
        Id: "old-container",
        Name: "/gearbot",
        Image: "sha256:old",
        Config: {},
        HostConfig: {},
        NetworkSettings: { Networks: {} }
      }
    });
    const createdContainer = container({
      id: "new-container",
      inspect: { Image: "sha256:new" }
    });
    const removeImage = vi.fn().mockRejectedValue(new Error("image is referenced"));
    const docker = dockerClient({
      containers: [
        {
          Id: "old-container",
          Names: ["/gearbot"],
          Image: "kostia/gearbot:v1",
          ImageID: "sha256:old"
        }
      ],
      afterRecreateContainers: [
        {
          Id: "new-container",
          Names: ["/gearbot"],
          Image: "kostia/gearbot:v2",
          ImageID: "sha256:new"
        }
      ],
      getContainer: previousContainer,
      createContainer: createdContainer,
      removeImage
    });

    await expect(
      updateMatchingContainers(
        docker,
        "kostia/gearbot",
        "v2",
        "/config.json",
        true
      )
    ).resolves.toMatchObject({
      matched: 1,
      actions: [{ status: "recreated" }]
    });
  });
});

function container({
  id = "container",
  inspect
}: {
  id?: string;
  inspect: Record<string, unknown>;
}) {
  return {
    id,
    inspect: vi.fn().mockResolvedValue(inspect),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined)
  };
}

function dockerClient({
  containers,
  afterRecreateContainers = [],
  getContainer,
  createContainer,
  removeImage
}: {
  containers: Array<Record<string, unknown>>;
  afterRecreateContainers?: Array<Record<string, unknown>>;
  getContainer: Record<string, unknown>;
  createContainer: Record<string, unknown>;
  removeImage: (imageId: string) => Promise<void>;
}) {
  let listCalls = 0;
  return {
    listContainers: vi.fn().mockImplementation(() => {
      listCalls += 1;
      return Promise.resolve(listCalls === 1 ? containers : afterRecreateContainers);
    }),
    pull: vi.fn().mockResolvedValue({}),
    modem: {
      followProgress: vi.fn((_stream, callback) => callback())
    },
    getContainer: vi.fn(() => getContainer),
    createContainer: vi.fn().mockResolvedValue(createContainer),
    getImage: vi.fn((imageId: string) => ({
      remove: vi.fn(() => removeImage(imageId))
    }))
  } as never;
}
