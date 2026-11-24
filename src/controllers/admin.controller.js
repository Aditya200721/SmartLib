
const adminService = require("../services/admin.service");

function createAdminController(db) {
  return {
    dashboard(req, res, next) {
      try {
        res.json({ data: adminService.getDashboardStats(db) });
      } catch (error) {
        next(error);
      }
    },

    books(req, res, next) {
      try {
        res.json({ data: adminService.getBooks(db, req.query) });
      } catch (error) {
        next(error);
      }
    },

    createBook(req, res, next) {
      try {
        const book = adminService.createBook(db, req.body);
        res.status(201).json({ message: "Book created successfully.", data: book });
      } catch (error) {
        next(error);
      }
    },

    updateBook(req, res, next) {
      try {
        const book = adminService.updateBook(db, req.params.id, req.body);
        res.json({ message: "Book updated successfully.", data: book });
      } catch (error) {
        next(error);
      }
    },

    archiveBook(req, res, next) {
      try {
        const book = adminService.setBookArchived(db, req.params.id, true);
        res.json({ message: "Book archived successfully.", data: book });
      } catch (error) {
        next(error);
      }
    },

    restoreBook(req, res, next) {
      try {
        const book = adminService.setBookArchived(db, req.params.id, false);
        res.json({ message: "Book restored successfully.", data: book });
      } catch (error) {
        next(error);
      }
    },

    categories(req, res, next) {
      try {
        res.json({ data: adminService.getCategories(db) });
      } catch (error) {
        next(error);
      }
    },

    createCategory(req, res, next) {
      try {
        const category = adminService.createCategory(db, req.body);
        res.status(201).json({
          message: "Category created successfully.",
          data: category
        });
      } catch (error) {
        next(error);
      }
    },

    updateCategory(req, res, next) {
      try {
        const category = adminService.updateCategory(db, req.params.id, req.body);
        res.json({ message: "Category updated successfully.", data: category });
      } catch (error) {
        next(error);
      }
    },

    deleteCategory(req, res, next) {
      try {
        const result = adminService.deleteCategory(db, req.params.id);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },

    requests(req, res, next) {
      try {
        res.json({ data: adminService.getRequests(db, req.query) });
      } catch (error) {
        next(error);
      }
    },

    reviewRequest(req, res, next) {
      try {
        const request = adminService.reviewRequest(
          db, req.params.id, req.user.id, req.body
        );

        res.json({
          message: "Borrowing request reviewed successfully.",
          data: request
        });
      } catch (error) {
        next(error);
      }
    },

    loans(req, res, next) {
      try {
        res.json({ data: adminService.getLoans(db, req.query) });
      } catch (error) {
        next(error);
      }
    },

    returnLoan(req, res, next) {
      try {
        const loan = adminService.returnLoan(db, req.params.id);
        res.json({ message: "Book returned successfully.", data: loan });
      } catch (error) {
        next(error);
      }
    }
  };
}

module.exports = { createAdminController };
