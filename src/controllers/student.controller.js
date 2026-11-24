
/* SMART LIB — STUDENT CONTROLLER */

"use strict";

const {
  getBooks,
  getCategories,
  createBorrowingRequest,
  getStudentRequests,
  getStudentLoans,
  getStudentProfile,
  getContentRecommendations,
  getGraphRecommendations,
  getGraphData
} = require("../services/student.service");

function createStudentController(db) {

  function books(req, res, next) {
    try {
      const result = getBooks(db, {
        search: req.query.search,
        categoryId: req.query.categoryId,
        page: req.query.page,
        limit: req.query.limit
      });

      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  function categories(req, res, next) {
    try {
      return res.status(200).json({
        categories: getCategories(db)
      });
    } catch (error) {
      return next(error);
    }
  }

  function createRequest(req, res, next) {
    try {
      const request = createBorrowingRequest(
        db,
        req.user.id,
        req.body.bookId
      );

      return res.status(201).json({
        message: "Borrowing request submitted successfully.",
        request
      });
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.message
        });
      }

      return next(error);
    }
  }

  function requests(req, res, next) {
    try {
      return res.status(200).json({
        requests: getStudentRequests(db, req.user.id)
      });
    } catch (error) {
      return next(error);
    }
  }

  function loans(req, res, next) {
    try {
      return res.status(200).json({
        loans: getStudentLoans(db, req.user.id)
      });
    } catch (error) {
      return next(error);
    }
  }

  function profile(req, res, next) {
    try {
      const student = getStudentProfile(db, req.user.id);

      if (!student) {
        return res.status(404).json({
          error: "Student profile not found."
        });
      }

      return res.status(200).json({ student });
    } catch (error) {
      return next(error);
    }
  }

  function contentRecommendations(req, res, next) {
    try {
      const recommendations = getContentRecommendations(
        db,
        req.user.id,
        req.query.limit
      );

      return res.status(200).json({
        recommendations
      });
    } catch (error) {
      return next(error);
    }
  }

  function graphRecommendations(req, res, next) {
    try {
      const recommendations = getGraphRecommendations(
        db,
        req.user.id,
        req.query.limit
      );

      return res.status(200).json({
        recommendations
      });
    } catch (error) {
      return next(error);
    }
  }

  function graphData(req, res, next) {
    try {
      const graph = getGraphData(
        db,
        req.user.id,
        req.query.limit
      );

      return res.status(200).json(graph);
    } catch (error) {
      return next(error);
    }
  }

  return {
    books,
    categories,
    createRequest,
    requests,
    loans,
    profile,
    contentRecommendations,
    graphRecommendations,
    graphData
  };
}

module.exports = { createStudentController };
