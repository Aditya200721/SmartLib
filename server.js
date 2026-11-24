
"use strict";

require("dotenv").config();

const { createApp } = require("./src/app");
const { initializeDatabase } = require("./src/database/init");
const { getDatabase } = require("./src/database/connection");
const { getConfig } = require("./src/config/env");

let server;
let db;
let app;
let isShuttingDown = false;

function startServer() {
  const config = getConfig();

  // Initialize database schema before starting the application.
  initializeDatabase();

  db = getDatabase();
  app = createApp(db);

  server = app.listen(config.port, () => {
    console.log(
      `SMART LIB server running on port ${config.port}`
    );

    console.log(
      `Health check: http://localhost:${config.port}/api/health`
    );

    console.log(`Environment: ${config.nodeEnv}`);
  });

  server.on("error", (error) => {
    console.error("SMART LIB server error:", error.message);
    process.exitCode = 1;

    closeResources();
  });
}

function closeResources() {
  try {
    app?.locals?.sessionStore?.close();
  } catch (error) {
    console.error("Session store shutdown error:", error.message);
    process.exitCode = 1;
  }

  try {
    if (db?.open) {
      db.close();
    }

    console.log("SMART LIB database connection closed.");
  } catch (error) {
    console.error("Database shutdown error:", error.message);
    process.exitCode = 1;
  }
}

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`\n${signal} received. Closing SMART LIB...`);

  if (!server || !server.listening) {
    closeResources();
    return;
  }

  server.close((error) => {
    if (error) {
      console.error("Server shutdown error:", error.message);
      process.exitCode = 1;
    }

    closeResources();

    console.log("SMART LIB shutdown completed.");
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

try {
  startServer();
} catch (error) {
  console.error("SMART LIB startup failed:", error.message);
  closeResources();
  process.exitCode = 1;
}
