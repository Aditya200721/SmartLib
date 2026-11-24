
const express = require("express");
const { createAdminController } = require("../controllers/admin.controller");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");

function createAdminRoutes(db) {
  const router = express.Router();
  const controller = createAdminController(db);

  router.use(requireAuth, requireRole("admin"));

  router.get("/dashboard", controller.dashboard);

  router.get("/books", controller.books);
  router.post("/books", controller.createBook);
  router.patch("/books/:id", controller.updateBook);
  router.patch("/books/:id/archive", controller.archiveBook);
  router.patch("/books/:id/restore", controller.restoreBook);

  router.get("/categories", controller.categories);
  router.post("/categories", controller.createCategory);
  router.patch("/categories/:id", controller.updateCategory);
  router.delete("/categories/:id", controller.deleteCategory);

  router.get("/requests", controller.requests);
  router.patch("/requests/:id/review", controller.reviewRequest);

  router.get("/loans", controller.loans);
  router.post("/loans/:id/return", controller.returnLoan);

  return router;
}

module.exports = { createAdminRoutes };
