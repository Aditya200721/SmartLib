
"use strict";

require("dotenv").config();

const bcrypt = require("bcryptjs");
const { getConfig } = require("../config/env");
const { getDatabase } = require("./connection");
const { createSchema } = require("./schema");

const categories = [
  ["Programming", "Books about programming languages and software development."],
  ["Computer Science", "Core computer science concepts and algorithms."],
  ["Artificial Intelligence", "Artificial intelligence and machine learning."],
  ["Mathematics", "Mathematics for science and engineering."],
  ["Fiction", "Novels and imaginative literature."],
  ["Productivity", "Habits, focus and personal productivity."]
];

const books = [
  ["Python Crash Course", "Eric Matthes", "9781593279288", "Programming", "A hands-on introduction to programming with Python.", 5],
  ["Clean Code", "Robert C. Martin", "9780132350884", "Programming", "A practical guide to writing readable and maintainable code.", 4],
  ["The Alchemist", "Paulo Coelho", "9780062315007", "Fiction", "A philosophical novel about following a personal journey.", 6],
  ["Introduction to Algorithms", "Thomas H. Cormen et al.", "9780262046305", "Computer Science", "A comprehensive textbook on algorithms.", 3],
  ["Atomic Habits", "James Clear", "9780735211292", "Productivity", "A practical guide to building effective habits.", 5],
  ["Artificial Intelligence: A Modern Approach", "Stuart Russell and Peter Norvig", "9780134610993", "Artificial Intelligence", "A broad introduction to modern artificial intelligence.", 3],
  ["Linear Algebra and Its Applications", "David C. Lay", "9780321982384", "Mathematics", "An introduction to linear algebra and its applications.", 4],
  ["Eloquent JavaScript", "Marijn Haverbeke", "9781593279509", "Programming", "A modern introduction to JavaScript programming.", 4]
];

const DEMO_ADMIN_EMAIL = "admin@smartlib.local";
const DEMO_STUDENT_EMAIL = "student@smartlib.local";

function seedDatabase(db = getDatabase()) {
  createSchema(db);

  const config = getConfig();
  const isProduction = config.nodeEnv === "production";

  const seed = db.transaction(() => {
    // Never create or reactivate demonstration accounts in production.
    if (isProduction) {
      db.prepare(`
        UPDATE users
        SET is_active = 0
        WHERE email IN (?, ?)
      `).run(DEMO_ADMIN_EMAIL, DEMO_STUDENT_EMAIL);
    } else {
      const adminHash = bcrypt.hashSync(
        "Admin@12345",
        config.bcryptRounds
      );

      const studentHash = bcrypt.hashSync(
        "Student@12345",
        config.bcryptRounds
      );

      const insertUser = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, is_active)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(email) DO NOTHING
      `);

      insertUser.run(
        "SMART LIB Administrator",
        DEMO_ADMIN_EMAIL,
        adminHash,
        "admin"
      );

      insertUser.run(
        "Demo Student",
        DEMO_STUDENT_EMAIL,
        studentHash,
        "student"
      );
    }

    const insertCategory = db.prepare(`
      INSERT INTO categories (name, description)
      VALUES (?, ?)
      ON CONFLICT(name) DO NOTHING
    `);

    for (const category of categories) {
      insertCategory.run(...category);
    }

    const categoryIds = new Map(
      db.prepare("SELECT id, name FROM categories")
        .all()
        .map((row) => [row.name, row.id])
    );

    const insertBook = db.prepare(`
      INSERT INTO books (
        title,
        author,
        isbn,
        category_id,
        description,
        total_copies,
        available_copies
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(isbn) DO NOTHING
    `);

    for (const [
      title,
      author,
      isbn,
      category,
      description,
      copies
    ] of books) {
      const categoryId = categoryIds.get(category);

      if (!categoryId) {
        throw new Error(`Missing seed category: ${category}`);
      }

      insertBook.run(
        title,
        author,
        isbn,
        categoryId,
        description,
        copies,
        copies
      );
    }
  });

  seed();

  return {
    users: db.prepare(
      "SELECT COUNT(*) AS count FROM users"
    ).get().count,

    categories: db.prepare(
      "SELECT COUNT(*) AS count FROM categories"
    ).get().count,

    books: db.prepare(
      "SELECT COUNT(*) AS count FROM books"
    ).get().count
  };
}

if (require.main === module) {
  const counts = seedDatabase();

  console.log("SMART LIB database seeding completed.");

  console.log(
    `Users: ${counts.users}; categories: ${counts.categories}; books: ${counts.books}`
  );

  if (process.env.DATABASE_PATH !== ":memory:") {
    getDatabase().close();
  }
}

module.exports = {
  seedDatabase,
  categories,
  books
};
