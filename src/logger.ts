import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "params.secret",
      "secret",
      "authconfig",
      "*.authconfig",
      "auth",
      "*.auth",
      "password",
      "*.password",
      "identitytoken",
      "*.identitytoken"
    ],
    remove: true
  }
});
