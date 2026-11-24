
const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const request = require("supertest");

const { createSchema } = require("../src/database/schema");
const { seedDatabase } = require("../src/database/seed");
const { createApp } = require("../src/app");
const {
  requireAuth,
  requireRole
} = require("../src/middleware/auth.middleware");

function setup() {
  const db = new Database(":memory:");

  db.pragma("foreign_keys = ON");
  createSchema(db);
  seedDatabase(db);

  const app = createApp(db, {
    sessionSecret: "test-session-secret-that-is-long-enough",

    // Register testing routes before Express's 404 handler.
    configureRoutes(app) {
      app.get(
        "/api/test/private",
        requireAuth,
        (req, res) => {
          res.json({ userId: req.user.id });
        }
      );

      app.get(
        "/api/test/admin",
        requireRole("admin"),
        (req, res) => {
          res.json({ access: "admin" });
        }
      );
    }
  });

  return { db, app };
}

// TEST 1: Student registration and password hashing
test("student registration stores a bcrypt hash and always assigns student role", async () => {
  const { db, app } = setup();

  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Test Student",
      email: "TEST@example.com",
      password: "StrongPass123"
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "student");
  assert.equal(response.body.user.email, "test@example.com");

  const row = db.prepare(
    "SELECT password_hash FROM users WHERE email = ?"
  ).get("test@example.com");

  assert.notEqual(row.password_hash, "StrongPass123");

  db.close();
});

// TEST 2: Duplicate registration and invalid input
test("registration rejects duplicate email and invalid input", async () => {
  const { db, app } = setup();

  const payload = {
    name: "New Student",
    email: "new@example.com",
    password: "StrongPass123"
  };

  const first = await request(app)
    .post("/api/auth/register")
    .send(payload);

  const duplicate = await request(app)
    .post("/api/auth/register")
    .send(payload);

  const invalid = await request(app)
    .post("/api/auth/register")
    .send({
      name: "X",
      email: "bad",
      password: "123"
    });

  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 409);
  assert.equal(invalid.status, 400);

  db.close();
});

// TEST 3: Admin login and session verification
test("seeded admin can log in and /me returns the authenticated account", async () => {
  const { db, app } = setup();

  const agent = request.agent(app);

  const login = await agent
    .post("/api/auth/login")
    .send({
      email: "admin@smartlib.local",
      password: "Admin@12345",
      role: "admin"
    });

  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, "admin");

  const me = await agent.get("/api/auth/me");

  assert.equal(me.status, 200);
  assert.equal(me.body.authenticated, true);
  assert.equal(me.body.user.email, "admin@smartlib.local");

  db.close();
});

// TEST 4: Wrong role and incorrect password
test("student cannot use admin login portal and incorrect password is rejected", async () => {
  const { db, app } = setup();

  const wrongRole = await request(app)
    .post("/api/auth/login")
    .send({
      email: "student@smartlib.local",
      password: "Student@12345",
      role: "admin"
    });

  assert.equal(wrongRole.status, 401);

  const wrongPassword = await request(app)
    .post("/api/auth/login")
    .send({
      email: "admin@smartlib.local",
      password: "wrong-password"
    });

  assert.equal(wrongPassword.status, 401);

  db.close();
});

// TEST 5: Authentication and role-based authorization
test("private route rejects anonymous users and admin route rejects students", async () => {
  const { db, app } = setup();

  // Anonymous user must receive 401.
  const anonymous = await request(app)
    .get("/api/test/private");

  assert.equal(anonymous.status, 401);

  // Login as student.
  const studentAgent = request.agent(app);

  const login = await studentAgent
    .post("/api/auth/login")
    .send({
      email: "student@smartlib.local",
      password: "Student@12345",
      role: "student"
    });

  assert.equal(login.status, 200);

  // Authenticated student can access private route.
  const privateResponse = await studentAgent
    .get("/api/test/private");

  assert.equal(privateResponse.status, 200);

  // Student must not access admin-only route.
  const adminResponse = await studentAgent
    .get("/api/test/admin");

  assert.equal(adminResponse.status, 403);

  db.close();
});

// TEST 6: Logout and session destruction
test("logout destroys the session and /me reports anonymous state", async () => {
  const { db, app } = setup();

  const agent = request.agent(app);

  await agent
    .post("/api/auth/login")
    .send({
      email: "student@smartlib.local",
      password: "Student@12345"
    });

  const beforeLogout = await agent.get("/api/auth/me");

  assert.equal(beforeLogout.body.authenticated, true);

  const logout = await agent.post("/api/auth/logout");

  assert.equal(logout.status, 200);

  const afterLogout = await agent.get("/api/auth/me");

  assert.equal(afterLogout.body.authenticated, false);

  db.close();
});
