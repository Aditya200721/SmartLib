
/* SMART LIB — STUDENT ROUTES */

"use strict";

const express = require("express");

const {
  createStudentController
} = require("../controllers/student.controller");

const {
  requireAuth,
  requireRole
} = require("../middleware/auth.middleware");

function createStudentRoutes(db) {
  const router = express.Router();

  const controller = createStudentController(db);

  // Protect all student routes.
  router.use(
    requireAuth,
    requireRole("student")
  );

  // Books
  router.get("/books", controller.books);
  router.get("/categories", controller.categories);

  // Borrowing requests
  router.post("/requests", controller.createRequest);
  router.get("/requests", controller.requests);

  // Loans and profile
  router.get("/loans", controller.loans);
  router.get("/profile", controller.profile);

  // Recommendations
  router.get(
    "/recommendations/content",
    controller.contentRecommendations
  );

  router.get(
    "/recommendations/graph",
    controller.graphRecommendations
  );

  router.get(
    "/recommendations/graph-data",
    controller.graphData
  );

  return router;
}

module.exports = {
  createStudentRoutes
};
