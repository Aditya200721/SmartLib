
"use strict";

const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

let database;
let activeDatabasePath;

function openDatabase(databasePath) {
  if (!databasePath) {
    throw new Error("A database path is required.");
  }

  const resolvedPath =
    databasePath === ":memory:"
      ? ":memory:"
      : path.resolve(databasePath);

  if (database?.open) {
    if (activeDatabasePath === resolvedPath) {
      return database;
    }

    throw new Error(
      "A database connection is already open. Close it before opening another database."
    );
  }

  if (resolvedPath !== ":memory:") {
    fs.mkdirSync(path.dirname(resolvedPath), {
      recursive: true
    });
  }

  const connection = new Database(resolvedPath);

  try {
    connection.pragma("foreign_keys = ON");
    connection.pragma("busy_timeout = 5000");

    if (resolvedPath !== ":memory:") {
      connection.pragma("journal_mode = WAL");
      connection.pragma("synchronous = NORMAL");
    }

    database = connection;
    activeDatabasePath = resolvedPath;

    return database;
  } catch (error) {
    connection.close();
    throw error;
  }
}

function getDatabase() {
  if (!database || !database.open) {
    const configuredPath =
      process.env.DATABASE_PATH || "./data/smartlib.sqlite";

    return openDatabase(configuredPath);
  }

  return database;
}

function closeDatabase() {
  if (database?.open) {
    database.close();
  }

  database = undefined;
  activeDatabasePath = undefined;
}

module.exports = {
  openDatabase,
  getDatabase,
  closeDatabase
};
