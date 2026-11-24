const express = require("express");
const { createAuthController } = require("../controllers/auth.controller");

function createAuthRoutes(db) {
  const router = express.Router();
  const controller = createAuthController(db);

  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/logout", controller.logout);
  router.get("/me", controller.me);

  return router;
}

module.exports = { createAuthRoutes };
