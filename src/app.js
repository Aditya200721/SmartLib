
"use strict";

const express = require("express");
const helmet = require("helmet");
const path = require("node:path");
const session = require("express-session");

const { SQLiteSessionStore } = require("./database/sqlite-session-store");
const { createAuthRoutes } = require("./routes/auth.routes");
const { createStudentRoutes } = require("./routes/student.routes");
const { createAdminRoutes } = require("./routes/admin.routes");

const { getPublicUser } = require("./services/auth.service");
const { requireAuth, requireRole } = require("./middleware/auth.middleware");

function createApp(db, options = {}) {
  if (!db) {
    throw new Error("A database connection is required.");
  }

  const app = express();

  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";

  const sessionSecret =
    options.sessionSecret ||
    process.env.SESSION_SECRET ||
    "smartlib-development-only-secret-change-before-deployment";

  if (isProduction) {
    if (
      typeof sessionSecret !== "string" ||
      sessionSecret.length < 32 ||
      sessionSecret.includes("replace-this") ||
      sessionSecret ===
        "smartlib-development-only-secret-change-before-deployment"
    ) {
      throw new Error(
        "Production requires a valid SESSION_SECRET of at least 32 characters."
      );
    }

    // Required when deployed behind one trusted HTTPS reverse proxy.
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");

  app.use(helmet());

  app.use(express.json({ limit: "20kb" }));
  app.use(express.urlencoded({ extended: false, limit: "20kb" }));

  // Create and retain the session store for graceful shutdown.
  const sessionStore = new SQLiteSessionStore(db);
  app.locals.sessionStore = sessionStore;

  app.use(
    session({
      name: "smartlib.sid",
      secret: sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 8
      }
    })
  );

  // Load the current account from the database on every request.
  app.use((req, res, next) => {
    if (!req.session.userId) {
      req.user = null;
      return next();
    }

    const user = getPublicUser(db, req.session.userId);

    if (!user || !user.is_active) {
      return req.session.destroy((error) => {
        if (error) {
          return next(error);
        }

        req.user = null;
        return next();
      });
    }

    req.user = user;
    return next();
  });

  // API health check.
  app.get("/api/health", (req, res) => {
    try {
      const result = db.prepare("SELECT 1 AS ok").get();

      res.status(200).json({
        status: "ok",
        service: "SMART LIB API",
        database: result.ok === 1 ? "connected" : "unavailable",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Health check failed:", error.message);

      res.status(503).json({
        status: "error",
        service: "SMART LIB API",
        database: "unavailable"
      });
    }
  });

  // Authentication routes.
  app.use("/api/auth", createAuthRoutes(db));

  // Student API routes.
  app.use("/api/student", createStudentRoutes(db));

  // Admin API routes.
  app.use("/api/admin", createAdminRoutes(db));

  // Optional routes used by tests or extensions.
  if (typeof options.configureRoutes === "function") {
    options.configureRoutes(app);
  }

  // Protected Student Dashboard.
  app.get(
    "/student-portal.html",
    requireAuth,
    requireRole("student"),
    (req, res) => {
      res.sendFile(
        path.join(__dirname, "../public/student-portal.html")
      );
    }
  );

  // Protected Admin Dashboard.
  app.get(
    "/admin-dashboard.html",
    requireAuth,
    requireRole("admin"),
    (req, res) => {
      res.sendFile(
        path.join(__dirname, "../public/admin-dashboard.html")
      );
    }
  );

  // Serve frontend files.
  app.use(express.static(path.join(__dirname, "../public")));

  // Central error handler.
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    console.error(
      "Unhandled application error:",
      error.message
    );

    const status =
      Number.isInteger(error.status) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 500;

    res.status(status).json({
      error:
        status < 500
          ? error.message
          : "Internal server error"
    });
  });

  return app;
}

module.exports = { createApp };
