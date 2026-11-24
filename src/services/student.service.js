
/* SMART LIB — STUDENT SERVICE */

"use strict";

/* BOOKS */

function getBooks(db, filters = {}) {
  const search = String(filters.search || "").trim();
  const categoryId = Number(filters.categoryId) || null;

  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(filters.limit, 10) || 12));
  const offset = (page - 1) * limit;

  const conditions = ["b.is_archived = 0"];
  const params = [];

  if (search) {
    conditions.push("(b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  if (categoryId) {
    conditions.push("b.category_id = ?");
    params.push(categoryId);
  }

  const whereClause = conditions.join(" AND ");

  const books = db.prepare(`
    SELECT
      b.id,
      b.title,
      b.author,
      b.isbn,
      b.description,
      b.total_copies,
      b.available_copies,
      c.id AS category_id,
      c.name AS category_name
    FROM books b
    JOIN categories c ON c.id = b.category_id
    WHERE ${whereClause}
    ORDER BY b.title COLLATE NOCASE ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM books b
    WHERE ${whereClause}
  `).get(...params).count;

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

/* CATEGORIES */

function getCategories(db) {
  return db.prepare(`
    SELECT
      c.id,
      c.name,
      c.description,
      COUNT(b.id) AS book_count
    FROM categories c
    LEFT JOIN books b
      ON b.category_id = c.id AND b.is_archived = 0
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE ASC
  `).all();
}

/* BORROWING REQUEST */

function createBorrowingRequest(db, studentId, bookId) {
  const parsedBookId = Number(bookId);

  if (!Number.isSafeInteger(parsedBookId) || parsedBookId <= 0) {
    const error = new Error("Invalid book ID.");
    error.status = 400;
    throw error;
  }

  const createRequest = db.transaction(() => {
    const book = db.prepare(`
      SELECT id, title, available_copies, is_archived
      FROM books
      WHERE id = ?
    `).get(parsedBookId);

    if (!book || book.is_archived) {
      const error = new Error("Book not found.");
      error.status = 404;
      throw error;
    }

    if (book.available_copies <= 0) {
      const error = new Error("This book is currently unavailable.");
      error.status = 409;
      throw error;
    }

    const existingRequest = db.prepare(`
      SELECT id
      FROM borrowing_requests
      WHERE student_id = ?
        AND book_id = ?
        AND status IN ('pending', 'approved')
      LIMIT 1
    `).get(studentId, parsedBookId);

    if (existingRequest) {
      const error = new Error("You already have an active request for this book.");
      error.status = 409;
      throw error;
    }

    const activeLoan = db.prepare(`
      SELECT id
      FROM loans
      WHERE student_id = ?
        AND book_id = ?
        AND status = 'active'
      LIMIT 1
    `).get(studentId, parsedBookId);

    if (activeLoan) {
      const error = new Error("You already have this book on loan.");
      error.status = 409;
      throw error;
    }

    const result = db.prepare(`
      INSERT INTO borrowing_requests (student_id, book_id)
      VALUES (?, ?)
    `).run(studentId, parsedBookId);

    return db.prepare(`
      SELECT
        br.id,
        br.book_id,
        b.title AS book_title,
        br.requested_at,
        br.status
      FROM borrowing_requests br
      JOIN books b ON b.id = br.book_id
      WHERE br.id = ?
    `).get(result.lastInsertRowid);
  });

  return createRequest();
}

/* MY REQUESTS */

function getStudentRequests(db, studentId) {
  return db.prepare(`
    SELECT
      br.id,
      br.book_id,
      b.title AS book_title,
      b.author,
      br.requested_at,
      br.reviewed_at,
      br.status,
      br.decision_note
    FROM borrowing_requests br
    JOIN books b ON b.id = br.book_id
    WHERE br.student_id = ?
    ORDER BY br.requested_at DESC, br.id DESC
  `).all(studentId);
}

/* MY LOANS */

function getStudentLoans(db, studentId) {
  return db.prepare(`
    SELECT
      l.id,
      l.book_id,
      b.title AS book_title,
      b.author,
      l.issue_date,
      l.due_date,
      l.return_date,
      l.status,
      CASE
        WHEN l.status = 'active' AND date(l.due_date) < date('now')
        THEN 1
        ELSE 0
      END AS is_overdue
    FROM loans l
    JOIN books b ON b.id = l.book_id
    WHERE l.student_id = ?
    ORDER BY
      CASE WHEN l.status = 'active' THEN 0 ELSE 1 END,
      l.due_date ASC
  `).all(studentId);
}

/* STUDENT PROFILE */

function getStudentProfile(db, studentId) {
  const student = db.prepare(`
    SELECT id, name, email, role, created_at
    FROM users
    WHERE id = ? AND role = 'student' AND is_active = 1
  `).get(studentId);

  if (!student) return null;

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*)
       FROM borrowing_requests
       WHERE student_id = ?) AS total_requests,

      (SELECT COUNT(*)
       FROM borrowing_requests
       WHERE student_id = ? AND status = 'pending') AS pending_requests,

      (SELECT COUNT(*)
       FROM loans
       WHERE student_id = ? AND status = 'active') AS active_loans,

      (SELECT COUNT(*)
       FROM loans
       WHERE student_id = ? AND status = 'returned') AS returned_books
  `).get(studentId, studentId, studentId, studentId);

  return {
    ...student,
    stats
  };
}

/* RECOMMENDATION HELPERS */

function getRecommendationLimit(limit) {
  return Math.min(12, Math.max(1, Number.parseInt(limit, 10) || 6));
}

/*
  Shared reading history:
  - Approved borrowing requests
  - Pending borrowing requests
  - Student loans

  UNION prevents duplicate student-book relationships.
*/

const studentReadingHistory = `
  SELECT student_id, book_id
  FROM borrowing_requests
  WHERE status IN ('approved', 'pending')

  UNION

  SELECT student_id, book_id
  FROM loans
`;

/* CONTENT-BASED RECOMMENDATIONS */

function getContentRecommendations(db, studentId, limit = 6) {
  const safeLimit = getRecommendationLimit(limit);

  const interests = db.prepare(`
    SELECT
      b.category_id,
      LOWER(b.author) AS author,
      COUNT(*) AS frequency
    FROM (${studentReadingHistory}) history
    JOIN books b ON b.id = history.book_id
    WHERE history.student_id = ?
      AND b.is_archived = 0
    GROUP BY b.category_id, LOWER(b.author)
  `).all(studentId);

  const categoryWeights = new Map();
  const authorWeights = new Map();

  for (const interest of interests) {
    categoryWeights.set(
      interest.category_id,
      (categoryWeights.get(interest.category_id) || 0) +
      interest.frequency
    );

    authorWeights.set(
      interest.author,
      (authorWeights.get(interest.author) || 0) +
      interest.frequency
    );
  }

  const candidates = db.prepare(`
    SELECT
      b.id,
      b.title,
      b.author,
      b.description,
      b.available_copies,
      c.id AS category_id,
      c.name AS category_name
    FROM books b
    JOIN categories c ON c.id = b.category_id
    WHERE b.is_archived = 0
      AND b.available_copies > 0

      AND NOT EXISTS (
        SELECT 1
        FROM borrowing_requests br
        WHERE br.student_id = ?
          AND br.book_id = b.id
          AND br.status IN ('pending', 'approved')
      )

      AND NOT EXISTS (
        SELECT 1
        FROM loans l
        WHERE l.student_id = ?
          AND l.book_id = b.id
      )
  `).all(studentId, studentId);

  if (interests.length === 0) {
    return db.prepare(`
      SELECT
        b.id,
        b.title,
        b.author,
        b.description,
        b.available_copies,
        c.id AS category_id,
        c.name AS category_name,
        (
          SELECT COUNT(DISTINCT history.student_id)
          FROM (${studentReadingHistory}) history
          WHERE history.book_id = b.id
        ) AS recommendation_score
      FROM books b
      JOIN categories c ON c.id = b.category_id
      WHERE b.is_archived = 0
        AND b.available_copies > 0
        AND NOT EXISTS (
          SELECT 1
          FROM borrowing_requests br
          WHERE br.student_id = ?
            AND br.book_id = b.id
            AND br.status IN ('pending', 'approved')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM loans l
          WHERE l.student_id = ?
            AND l.book_id = b.id
        )
      ORDER BY recommendation_score DESC,
               b.title COLLATE NOCASE ASC
      LIMIT ?
    `).all(studentId, studentId, safeLimit).map(book => ({
      ...book,
      recommendation_reason: "A popular available book in the library."
    }));
  }

  return candidates
    .map(book => {
      const categoryScore =
        categoryWeights.get(book.category_id) || 0;

      const authorScore =
        authorWeights.get(book.author.toLowerCase()) || 0;

      return {
        ...book,
        recommendation_score:
          categoryScore * 3 + authorScore * 2,

        recommendation_reason: categoryScore > 0
          ? `Because you have shown interest in ${book.category_name}.`
          : `Because you have read books by ${book.author}.`
      };
    })
    .filter(book => book.recommendation_score > 0)
    .sort((a, b) =>
      b.recommendation_score - a.recommendation_score ||
      a.title.localeCompare(b.title)
    )
    .slice(0, safeLimit);
}

/* GRAPH-BASED RECOMMENDATIONS */

function getGraphRecommendations(db, studentId, limit = 6) {
  const safeLimit = getRecommendationLimit(limit);

  return db.prepare(`
    WITH
    reading_history AS (
      ${studentReadingHistory}
    ),

    similar_students AS (
      SELECT
        other.student_id,
        COUNT(DISTINCT mine.book_id) AS shared_books
      FROM reading_history mine
      JOIN reading_history other
        ON mine.book_id = other.book_id
      WHERE mine.student_id = ?
        AND other.student_id != ?
      GROUP BY other.student_id
    )

    SELECT
      b.id,
      b.title,
      b.author,
      b.description,
      b.available_copies,
      c.id AS category_id,
      c.name AS category_name,

      COUNT(DISTINCT history.student_id) AS similar_student_count,

      SUM(similar_students.shared_books) AS recommendation_score

    FROM similar_students

    JOIN reading_history history
      ON history.student_id = similar_students.student_id

    JOIN books b
      ON b.id = history.book_id

    JOIN categories c
      ON c.id = b.category_id

    WHERE b.is_archived = 0
      AND b.available_copies > 0

      AND NOT EXISTS (
        SELECT 1
        FROM borrowing_requests br
        WHERE br.student_id = ?
          AND br.book_id = b.id
          AND br.status IN ('pending', 'approved')
      )

      AND NOT EXISTS (
        SELECT 1
        FROM loans l
        WHERE l.student_id = ?
          AND l.book_id = b.id
      )

    GROUP BY b.id

    ORDER BY
      recommendation_score DESC,
      similar_student_count DESC,
      b.title COLLATE NOCASE ASC

    LIMIT ?
  `).all(
    studentId,
    studentId,
    studentId,
    studentId,
    safeLimit
  ).map(book => ({
    ...book,
    recommendation_reason:
      `Recommended based on reading patterns of ${book.similar_student_count} similar student(s).`
  }));
}

/* INTERACTIVE GRAPH DATA */

function getGraphData(db, studentId, limit = 8) {
  const safeLimit = getRecommendationLimit(limit);

  const nodes = [];
  const edges = [];

  const nodeIds = new Set();
  const edgeIds = new Set();

  function addNode(node) {
    if (nodeIds.has(node.id)) return;

    nodeIds.add(node.id);
    nodes.push(node);
  }

  function addEdge(edge) {
    const key = `${edge.source}:${edge.target}:${edge.type}`;

    if (edgeIds.has(key)) return;

    edgeIds.add(key);
    edges.push({
      id: key,
      ...edge
    });
  }

  function addBookNode(book, extra = {}) {
    addNode({
      id: `book-${book.id}`,
      type: "book",
      label: book.title,
      title: book.title,
      author: book.author,
      category: book.category_name || "General",
      availableCopies: Number(book.available_copies) || 0,
      description: book.description || "",
      ...extra
    });
  }

  // The current student's own reading history.
  const ownHistory = db.prepare(`
    SELECT
      b.id,
      b.title,
      b.author,
      b.description,
      b.available_copies,
      c.name AS category_name
    FROM (${studentReadingHistory}) history
    JOIN books b ON b.id = history.book_id
    JOIN categories c ON c.id = b.category_id
    WHERE history.student_id = ?
      AND b.is_archived = 0
    ORDER BY b.title COLLATE NOCASE ASC
  `).all(studentId);

  addNode({
    id: "student-self",
    type: "student",
    label: "You",
    isCurrentStudent: true,
    readingCount: ownHistory.length
  });

  for (const book of ownHistory) {
    addBookNode(book, {
      isInReadingHistory: true
    });

    addEdge({
      source: "student-self",
      target: `book-${book.id}`,
      type: "reading",
      weight: 1
    });
  }

  // Find other active students who share reading history.
  const similarStudents = db.prepare(`
    WITH reading_history AS (
      ${studentReadingHistory}
    )

    SELECT
      other.student_id,
      COUNT(DISTINCT mine.book_id) AS shared_books
    FROM reading_history mine
    JOIN reading_history other
      ON mine.book_id = other.book_id
    JOIN users u
      ON u.id = other.student_id
      AND u.role = 'student'
      AND u.is_active = 1
    WHERE mine.student_id = ?
      AND other.student_id != ?
    GROUP BY other.student_id
    ORDER BY shared_books DESC, other.student_id ASC
    LIMIT 8
  `).all(studentId, studentId);

  const peerIds = similarStudents.map(peer => peer.student_id);

  // Never expose real peer IDs, names, or email addresses in graph data.
  const peerNodeIds = new Map();

  similarStudents.forEach((peer, index) => {
    const anonymousId = `reader-${index + 1}`;

    peerNodeIds.set(peer.student_id, anonymousId);

    addNode({
      id: anonymousId,
      type: "reader",
      label: `Similar reader ${index + 1}`,
      sharedBooks: Number(peer.shared_books) || 0
    });

    addEdge({
      source: "student-self",
      target: anonymousId,
      type: "similarity",
      weight: Number(peer.shared_books) || 1
    });
  });

  // Fetch the reading history of those similar readers.
  let peerHistory = [];

  if (peerIds.length > 0) {
    const placeholders = peerIds.map(() => "?").join(", ");

    peerHistory = db.prepare(`
      SELECT
        history.student_id,
        b.id,
        b.title,
        b.author,
        b.description,
        b.available_copies,
        c.name AS category_name
      FROM (${studentReadingHistory}) history
      JOIN books b ON b.id = history.book_id
      JOIN categories c ON c.id = b.category_id
      WHERE history.student_id IN (${placeholders})
        AND b.is_archived = 0
      ORDER BY b.title COLLATE NOCASE ASC
      LIMIT 80
    `).all(...peerIds);
  }

  const ownBookIds = new Set(ownHistory.map(book => book.id));

  for (const book of peerHistory) {
    const peerNodeId = peerNodeIds.get(book.student_id);

    if (!peerNodeId) continue;

    addBookNode(book, {
      isInReadingHistory: ownBookIds.has(book.id)
    });

    addEdge({
      source: peerNodeId,
      target: `book-${book.id}`,
      type: ownBookIds.has(book.id) ? "shared-reading" : "peer-reading",
      weight: 1
    });
  }

  // Prefer collaborative recommendations.
  let recommendations = getGraphRecommendations(
    db,
    studentId,
    safeLimit
  );

  let mode = "collaborative";

  // Cold-start or no collaborative matches:
  // use the existing content/popularity recommender instead.
  if (recommendations.length === 0) {
    recommendations = getContentRecommendations(
      db,
      studentId,
      safeLimit
    );

    mode = ownHistory.length === 0
      ? "popular-fallback"
      : "content-fallback";
  }

  for (const book of recommendations) {
    addBookNode(book, {
      isRecommended: true,
      recommendationScore: Number(
        book.recommendation_score ?? book.score ?? 0
      ),
      similarStudents: Number(
        book.similar_student_count ?? book.similar_students ?? 0
      ),
      recommendationReason: book.recommendation_reason || ""
    });

    addEdge({
      source: "student-self",
      target: `book-${book.id}`,
      type: "recommendation",
      weight: Number(book.recommendation_score) || 1
    });
  }

  const stats = {
    nodes: nodes.length,
    edges: edges.length,
    books: nodes.filter(node => node.type === "book").length,
    similarReaders: similarStudents.length,
    readingConnections: edges.filter(
      edge => edge.type === "reading" ||
              edge.type === "shared-reading" ||
              edge.type === "peer-reading"
    ).length,
    recommendedBooks: recommendations.length
  };

  return {
    nodes,
    edges,
    recommendations,
    stats,
    mode,
    message: mode === "collaborative"
      ? "Recommendations are based on shared reading patterns."
      : mode === "popular-fallback"
        ? "You're getting started! These popular books are a starting point until more reading history is available."
        : "There aren't enough similar-reader connections yet. These recommendations use your reading interests instead."
  };
}

/* EXPORTS */

module.exports = {
  getBooks,
  getCategories,
  createBorrowingRequest,
  getStudentRequests,
  getStudentLoans,
  getStudentProfile,
  getContentRecommendations,
  getGraphRecommendations,
  getGraphData
};
