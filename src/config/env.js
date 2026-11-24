
"use strict";

function getConfig() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const sessionSecret = process.env.SESSION_SECRET || "";

  const portValue = process.env.PORT || "3000";
  const bcryptRoundsValue = process.env.BCRYPT_ROUNDS || "12";

  const port = Number(portValue);
  const bcryptRounds = Number(bcryptRoundsValue);

  const databasePath = (
    process.env.DATABASE_PATH || "./data/smartlib.sqlite"
  ).trim();

  const allowedEnvironments = [
    "development",
    "test",
    "production"
  ];

  if (!allowedEnvironments.includes(nodeEnv)) {
    throw new Error("Invalid NODE_ENV configuration.");
  }

  if (nodeEnv === "production") {
    if (
      typeof sessionSecret !== "string" ||
      sessionSecret.trim().length < 32 ||
      sessionSecret.includes("replace-this") ||
      sessionSecret ===
        "smartlib-development-only-secret-change-before-deployment"
    ) {
      throw new Error(
        "Production requires a valid SESSION_SECRET of at least 32 characters."
      );
    }

    if (databasePath === ":memory:") {
      throw new Error(
        "Production requires a persistent SQLite database path."
      );
    }
  }

  if (
    !/^\d+$/.test(String(portValue)) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      "PORT must be an integer between 1 and 65535."
    );
  }

  if (
    typeof databasePath !== "string" ||
    databasePath.length === 0
  ) {
    throw new Error(
      "DATABASE_PATH must be a valid path."
    );
  }

  if (
    !/^\d+$/.test(String(bcryptRoundsValue)) ||
    !Number.isInteger(bcryptRounds) ||
    bcryptRounds < 10 ||
    bcryptRounds > 15
  ) {
    throw new Error(
      "BCRYPT_ROUNDS must be an integer between 10 and 15."
    );
  }

  return {
    nodeEnv,
    port,
    databasePath,
    bcryptRounds
  };
}

module.exports = { getConfig };
