
"use strict";

require("dotenv").config();

const { getConfig } = require("../config/env");
const { openDatabase, getDatabase } = require("./connection");
const { createSchema } = require("./schema");

function initializeDatabase(databasePath) {
  getConfig();

  const db = databasePath
    ? openDatabase(databasePath)
    : getDatabase();

  createSchema(db);

  return db;
}

if (require.main === module) {
  const db = initializeDatabase();

  console.log("SMART LIB database schema initialized successfully.");

  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    .all()
    .map((table) => table.name);

  console.log(`Tables: ${tables.join(", ")}`);

  if (process.env.DATABASE_PATH !== ":memory:") {
    db.close();
  }
}

module.exports = { initializeDatabase };
