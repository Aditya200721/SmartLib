const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { createSchema } = require("../src/database/schema");
const { seedDatabase } = require("../src/database/seed");

function makeDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  createSchema(db);
  return db;
}

test("creates all seven required tables and enables foreign keys", () => {
  const db = makeDb();
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name);
  for (const table of ["users", "categories", "books", "borrowing_requests", "loans", "sessions", "audit_logs"]) {
    assert.ok(names.includes(table), `Missing table ${table}`);
  }
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  db.close();
});

test("seed is idempotent and creates the two demonstration accounts", () => {
  const db = makeDb();
  const first = seedDatabase(db);
  const second = seedDatabase(db);
  assert.deepEqual(first, second);
  assert.equal(first.users, 2);
  assert.equal(first.categories, 6);
  assert.equal(first.books, 8);

  const admin = db.prepare("SELECT * FROM users WHERE email = ?").get("admin@smartlib.local");
  const student = db.prepare("SELECT * FROM users WHERE email = ?").get("student@smartlib.local");
  assert.equal(admin.role, "admin");
  assert.equal(student.role, "student");
  assert.notEqual(admin.password_hash, "Admin@12345");
  assert.equal(bcrypt.compareSync("Admin@12345", admin.password_hash), true);
  assert.equal(bcrypt.compareSync("Student@12345", student.password_hash), true);
  db.close();
});

test("constraints reject invalid roles and negative or excessive availability", () => {
  const db = makeDb();
  seedDatabase(db);
  const categoryId = db.prepare("SELECT id FROM categories LIMIT 1").get().id;
  assert.throws(() => db.prepare(`
    INSERT INTO users(name,email,password_hash,role) VALUES ('Bad User','bad@example.com','x','superuser')
  `).run());
  assert.throws(() => db.prepare(`
    INSERT INTO books(title,author,category_id,total_copies,available_copies)
    VALUES ('Bad Book','Author',?,2,3)
  `).run(categoryId));
  db.close();
});

test("foreign keys reject a book with an unknown category", () => {
  const db = makeDb();
  assert.throws(() => db.prepare(`
    INSERT INTO books(title,author,category_id,total_copies,available_copies)
    VALUES ('Orphan Book','Author',999,1,1)
  `).run());
  db.close();
});

test("book with borrowing history cannot be permanently deleted", () => {
  const db = makeDb();
  seedDatabase(db);
  const studentId = db.prepare("SELECT id FROM users WHERE role='student'").get().id;
  const adminId = db.prepare("SELECT id FROM users WHERE role='admin'").get().id;
  const bookId = db.prepare("SELECT id FROM books LIMIT 1").get().id;
  db.prepare(`
    INSERT INTO loans(student_id,book_id,issued_by,issue_date,due_date)
    VALUES (?, ?, ?, '2026-01-01', '2026-01-15')
  `).run(studentId, bookId, adminId);
  assert.throws(() => db.prepare("DELETE FROM books WHERE id = ?").run(bookId), /archived, not deleted/);
  db.close();
});
