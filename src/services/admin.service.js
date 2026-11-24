
function createError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getDashboardStats(db) {
  return {
    totalStudents: db.prepare(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'student' AND is_active = 1"
    ).get().count,

    totalBooks: db.prepare(
      "SELECT COUNT(*) AS count FROM books WHERE is_archived = 0"
    ).get().count,

    totalCategories: db.prepare(
      "SELECT COUNT(*) AS count FROM categories"
    ).get().count,

    pendingRequests: db.prepare(
      "SELECT COUNT(*) AS count FROM borrowing_requests WHERE status = 'pending'"
    ).get().count,

    activeLoans: db.prepare(
      "SELECT COUNT(*) AS count FROM loans WHERE status = 'active'"
    ).get().count,

    overdueLoans: db.prepare(
      "SELECT COUNT(*) AS count FROM loans WHERE status = 'active' AND due_date < date('now')"
    ).get().count
  };
}

function getBooks(db, filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(filters.limit) || 12));
  const offset = (page - 1) * limit;
  const search = String(filters.search || "").trim();
  const includeArchived = filters.includeArchived === "true";

  const conditions = [];
  const params = [];

  if (!includeArchived) conditions.push("b.is_archived = 0");

  if (search) {
    conditions.push("(b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM books b
    ${where}
  `).get(...params).count;

  const books = db.prepare(`
    SELECT b.*, c.name AS category_name
    FROM books b
    LEFT JOIN categories c ON c.id = b.category_id
    ${where}
    ORDER BY b.created_at DESC, b.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return {
    books,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

function createBook(db, data) {
  const title = String(data.title || "").trim();
  const author = String(data.author || "").trim();
  const isbn = String(data.isbn || "").trim();
  const description = String(data.description || "").trim();
  const categoryId = Number(data.categoryId);
  const totalCopies = Number(data.totalCopies);

  if (!title || !author || !isbn) {
    throw createError("Title, author and ISBN are required.");
  }

  if (!Number.isInteger(categoryId) || categoryId < 1) {
    throw createError("A valid category is required.");
  }

  if (!Number.isInteger(totalCopies) || totalCopies < 1) {
    throw createError("Total copies must be at least 1.");
  }

  const category = db.prepare(
    "SELECT id FROM categories WHERE id = ?"
  ).get(categoryId);

  if (!category) throw createError("Category not found.", 404);

  try {
    const result = db.prepare(`
      INSERT INTO books
        (title, author, isbn, category_id, description, total_copies, available_copies)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, author, isbn, categoryId, description,
      totalCopies, totalCopies
    );

    return db.prepare(`
      SELECT b.*, c.name AS category_name
      FROM books b
      LEFT JOIN categories c ON c.id = b.category_id
      WHERE b.id = ?
    `).get(result.lastInsertRowid);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw createError("A book with this ISBN already exists.", 409);
    }
    throw error;
  }
}

function updateBook(db, bookId, data) {
  const id = Number(bookId);
  if (!Number.isInteger(id) || id < 1) throw createError("Invalid book ID.");

  const current = db.prepare(
    "SELECT * FROM books WHERE id = ?"
  ).get(id);

  if (!current) throw createError("Book not found.", 404);

  const title = data.title === undefined ? current.title : String(data.title).trim();
  const author = data.author === undefined ? current.author : String(data.author).trim();
  const isbn = data.isbn === undefined ? current.isbn : String(data.isbn).trim();
  const description = data.description === undefined
    ? current.description
    : String(data.description).trim();
  const categoryId = data.categoryId === undefined
    ? current.category_id
    : Number(data.categoryId);
  const totalCopies = data.totalCopies === undefined
    ? current.total_copies
    : Number(data.totalCopies);

  if (!title || !author || !isbn) {
    throw createError("Title, author and ISBN cannot be empty.");
  }

  if (!Number.isInteger(categoryId) || categoryId < 1) {
    throw createError("Invalid category.");
  }

  if (!Number.isInteger(totalCopies) || totalCopies < 1) {
    throw createError("Total copies must be at least 1.");
  }

  const category = db.prepare(
    "SELECT id FROM categories WHERE id = ?"
  ).get(categoryId);

  if (!category) throw createError("Category not found.", 404);

  const issuedCopies = current.total_copies - current.available_copies;

  if (totalCopies < issuedCopies) {
    throw createError(`At least ${issuedCopies} total copies are required because some copies are currently issued.`);
  }

  try {
    db.prepare(`
      UPDATE books
      SET title = ?, author = ?, isbn = ?, category_id = ?,
          description = ?, total_copies = ?, available_copies = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title, author, isbn, categoryId, description,
      totalCopies, totalCopies - issuedCopies, id
    );
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw createError("A book with this ISBN already exists.", 409);
    }
    throw error;
  }

  return db.prepare("SELECT * FROM books WHERE id = ?").get(id);
}

function setBookArchived(db, bookId, archived) {
  const id = Number(bookId);
  if (!Number.isInteger(id) || id < 1) throw createError("Invalid book ID.");

  const book = db.prepare(
    "SELECT * FROM books WHERE id = ?"
  ).get(id);

  if (!book) throw createError("Book not found.", 404);

  if (archived) {
    const activeLoans = db.prepare(`
      SELECT COUNT(*) AS count
      FROM loans
      WHERE book_id = ? AND status = 'active'
    `).get(id).count;

    if (activeLoans > 0) {
      throw createError("This book has active loans and cannot be archived yet.", 409);
    }
  }

  db.prepare(`
    UPDATE books
    SET is_archived = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(archived ? 1 : 0, id);

  return db.prepare("SELECT * FROM books WHERE id = ?").get(id);
}

function getCategories(db) {
  return db.prepare(`
    SELECT c.*, COUNT(b.id) AS book_count
    FROM categories c
    LEFT JOIN books b ON b.category_id = c.id AND b.is_archived = 0
    GROUP BY c.id
    ORDER BY c.name
  `).all();
}

function createCategory(db, data) {
  const name = String(data.name || "").trim();
  const description = String(data.description || "").trim();

  if (!name) throw createError("Category name is required.");

  try {
    const result = db.prepare(`
      INSERT INTO categories (name, description)
      VALUES (?, ?)
    `).run(name, description);

    return db.prepare(
      "SELECT * FROM categories WHERE id = ?"
    ).get(result.lastInsertRowid);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw createError("This category already exists.", 409);
    }
    throw error;
  }
}

function updateCategory(db, categoryId, data) {
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id < 1) throw createError("Invalid category ID.");

  const current = db.prepare(
    "SELECT * FROM categories WHERE id = ?"
  ).get(id);

  if (!current) throw createError("Category not found.", 404);

  const name = data.name === undefined
    ? current.name
    : String(data.name).trim();
  const description = data.description === undefined
    ? current.description
    : String(data.description).trim();

  if (!name) throw createError("Category name cannot be empty.");

  try {
    db.prepare(`
      UPDATE categories SET name = ?, description = ? WHERE id = ?
    `).run(name, description, id);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw createError("This category already exists.", 409);
    }
    throw error;
  }

  return db.prepare(
    "SELECT * FROM categories WHERE id = ?"
  ).get(id);
}

function deleteCategory(db, categoryId) {
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id < 1) throw createError("Invalid category ID.");

  const category = db.prepare(
    "SELECT id FROM categories WHERE id = ?"
  ).get(id);

  if (!category) throw createError("Category not found.", 404);

  const bookCount = db.prepare(
    "SELECT COUNT(*) AS count FROM books WHERE category_id = ?"
  ).get(id).count;

  if (bookCount > 0) {
    throw createError("This category is assigned to books. Reassign those books before deleting it.", 409);
  }

  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  return { message: "Category deleted successfully." };
}

function getRequests(db, filters = {}) {
  const status = String(filters.status || "").trim();
  const allowed = ["pending", "approved", "rejected", "cancelled"];

  if (status && !allowed.includes(status)) {
    throw createError("Invalid request status.");
  }

  const where = status ? "WHERE br.status = ?" : "";
  const params = status ? [status] : [];

  return db.prepare(`
    SELECT
      br.*,
      u.name AS student_name,
      u.email AS student_email,
      b.title AS book_title,
      b.author AS book_author,
      b.isbn AS book_isbn,
      reviewer.name AS reviewer_name
    FROM borrowing_requests br
    JOIN users u ON u.id = br.student_id
    JOIN books b ON b.id = br.book_id
    LEFT JOIN users reviewer ON reviewer.id = br.reviewed_by
    ${where}
    ORDER BY
      CASE WHEN br.status = 'pending' THEN 0 ELSE 1 END,
      br.requested_at DESC
  `).all(...params);
}

function reviewRequest(db, requestId, adminId, data) {
  const id = Number(requestId);
  const decision = String(data.decision || "").trim().toLowerCase();
  const note = String(data.decisionNote || "").trim();

  if (!Number.isInteger(id) || id < 1) throw createError("Invalid request ID.");

  if (!["approved", "rejected"].includes(decision)) {
    throw createError("Decision must be approved or rejected.");
  }

  const transaction = db.transaction(() => {
    const request = db.prepare(
      "SELECT * FROM borrowing_requests WHERE id = ?"
    ).get(id);

    if (!request) throw createError("Borrowing request not found.", 404);
    if (request.status !== "pending") {
      throw createError("This request has already been reviewed.", 409);
    }

    if (decision === "approved") {
      const book = db.prepare(`
        SELECT * FROM books
        WHERE id = ? AND is_archived = 0
      `).get(request.book_id);

      if (!book) throw createError("This book is no longer available.", 409);
      if (book.available_copies < 1) {
        throw createError("No copies of this book are currently available.", 409);
      }

      const existingLoan = db.prepare(`
        SELECT id FROM loans
        WHERE student_id = ? AND book_id = ? AND status = 'active'
      `).get(request.student_id, request.book_id);

      if (existingLoan) {
        throw createError("This student already has an active loan for this book.", 409);
      }

      db.prepare(`
        UPDATE books
        SET available_copies = available_copies - 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND available_copies > 0
      `).run(request.book_id);

      db.prepare(`
        INSERT INTO loans
          (student_id, book_id, issued_by, issue_date, due_date, status)
        VALUES (?, ?, ?, date('now'), date('now', '+14 days'), 'active')
      `).run(request.student_id, request.book_id, adminId);
    }

    db.prepare(`
      UPDATE borrowing_requests
      SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
          decision_note = ?
      WHERE id = ? AND status = 'pending'
    `).run(decision, adminId, note || null, id);

    return db.prepare(`
      SELECT br.*, u.name AS student_name, b.title AS book_title
      FROM borrowing_requests br
      JOIN users u ON u.id = br.student_id
      JOIN books b ON b.id = br.book_id
      WHERE br.id = ?
    `).get(id);
  });

  return transaction();
}

function getLoans(db, filters = {}) {
  const status = String(filters.status || "").trim();

  if (status && !["active", "returned"].includes(status)) {
    throw createError("Invalid loan status.");
  }

  const where = status ? "WHERE l.status = ?" : "";
  const params = status ? [status] : [];

  return db.prepare(`
    SELECT
      l.*,
      u.name AS student_name,
      u.email AS student_email,
      b.title AS book_title,
      b.author AS book_author,
      CASE
        WHEN l.status = 'active' AND l.due_date < date('now') THEN 1
        ELSE 0
      END AS is_overdue
    FROM loans l
    JOIN users u ON u.id = l.student_id
    JOIN books b ON b.id = l.book_id
    ${where}
    ORDER BY l.created_at DESC
  `).all(...params);
}

function returnLoan(db, loanId) {
  const id = Number(loanId);
  if (!Number.isInteger(id) || id < 1) throw createError("Invalid loan ID.");

  const transaction = db.transaction(() => {
    const loan = db.prepare(
      "SELECT * FROM loans WHERE id = ?"
    ).get(id);

    if (!loan) throw createError("Loan not found.", 404);
    if (loan.status !== "active") {
      throw createError("This book has already been returned.", 409);
    }

    db.prepare(`
      UPDATE loans
      SET status = 'returned', return_date = date('now')
      WHERE id = ? AND status = 'active'
    `).run(id);

    db.prepare(`
      UPDATE books
      SET available_copies = available_copies + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(loan.book_id);

    return db.prepare(`
      SELECT l.*, u.name AS student_name, b.title AS book_title
      FROM loans l
      JOIN users u ON u.id = l.student_id
      JOIN books b ON b.id = l.book_id
      WHERE l.id = ?
    `).get(id);
  });

  return transaction();
}

module.exports = {
  getDashboardStats,
  getBooks,
  createBook,
  updateBook,
  setBookArchived,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getRequests,
  reviewRequest,
  getLoans,
  returnLoan
};
