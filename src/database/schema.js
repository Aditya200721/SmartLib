const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 100),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(email)) <= 254),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'student')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 2 AND 80),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  author TEXT NOT NULL CHECK(length(trim(author)) BETWEEN 1 AND 150),
  isbn TEXT UNIQUE,
  category_id INTEGER NOT NULL,
  description TEXT,
  total_copies INTEGER NOT NULL CHECK(total_copies >= 0),
  available_copies INTEGER NOT NULL CHECK(available_copies >= 0 AND available_copies <= total_copies),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS borrowing_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by INTEGER,
  reviewed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decision_note TEXT,
  FOREIGN KEY (student_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (book_id) REFERENCES books(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  issued_by INTEGER NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  return_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'returned')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(due_date >= issue_date),
  CHECK((status = 'active' AND return_date IS NULL) OR
        (status = 'returned' AND return_date IS NOT NULL)),
  FOREIGN KEY (student_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (book_id) REFERENCES books(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (issued_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expired INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  action TEXT NOT NULL CHECK(length(trim(action)) BETWEEN 1 AND 100),
  entity_type TEXT NOT NULL CHECK(length(trim(entity_type)) BETWEEN 1 AND 80),
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (actor_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category_id);
CREATE INDEX IF NOT EXISTS idx_books_available ON books(is_archived, available_copies);
CREATE INDEX IF NOT EXISTS idx_requests_student_status ON borrowing_requests(student_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_book_status ON borrowing_requests(book_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_status_date ON borrowing_requests(status, requested_at);
CREATE INDEX IF NOT EXISTS idx_loans_student_status ON loans(student_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_book_status ON loans(book_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_due_status ON loans(status, due_date);
CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TRIGGER IF NOT EXISTS prevent_book_delete_with_history
BEFORE DELETE ON books
WHEN EXISTS (SELECT 1 FROM loans WHERE book_id = OLD.id)
  OR EXISTS (SELECT 1 FROM borrowing_requests WHERE book_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'Books with borrowing history or requests must be archived, not deleted.');
END;
`;

function createSchema(db) {
  db.exec(schemaSql);
}

module.exports = { schemaSql, createSchema };
