const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const request = require("supertest");
const { createSchema } = require("../src/database/schema");
const { createApp } = require("../src/app");

test("GET /api/health reports API and SQLite connection status", async () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  createSchema(db);
  const app = createApp(db);
  const response = await request(app).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.database, "connected");
  db.close();
});
