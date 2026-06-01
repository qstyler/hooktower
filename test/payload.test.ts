import { describe, expect, it } from "vitest";
import { webhookPayloadSchema } from "../src/payload.js";

describe("webhookPayloadSchema", () => {
  it("accepts a Docker Hub compatible push payload", () => {
    expect(
      webhookPayloadSchema.parse({
        push_data: {
          tag: "latest"
        },
        repository: {
          repo_name: "kostia/gearbot"
        }
      })
    ).toEqual({
      push_data: {
        tag: "latest"
      },
      repository: {
        repo_name: "kostia/gearbot"
      }
    });
  });

  it("rejects missing fields", () => {
    expect(() => webhookPayloadSchema.parse({})).toThrow();
  });
});
