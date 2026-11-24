const bcrypt = require("bcryptjs");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateRegistration({ name, email, password }) {
  const cleanName = String(name || "").trim();
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || "");

  if (cleanName.length < 2 || cleanName.length > 100) {
    return "Name must contain between 2 and 100 characters.";
  }
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return "Enter a valid email address.";
  }
  // bcrypt only considers the first 72 bytes. Restrict to avoid silent truncation.
  if (cleanPassword.length < 8 || Buffer.byteLength(cleanPassword, "utf8") > 72) {
    return "Password must be at least 8 characters and no more than 72 bytes.";
  }
  return null;
}

function registerStudent(db, input, bcryptRounds = 12) {
  const validationError = validateRegistration(input);
  if (validationError) {
    const error = new Error(validationError);
    error.status = 400;
    throw error;
  }

  const name = String(input.name).trim();
  const email = normalizeEmail(input.email);
  const passwordHash = bcrypt.hashSync(String(input.password), bcryptRounds);

  try {
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, is_active)
      VALUES (?, ?, ?, 'student', 1)
    `).run(name, email, passwordHash);

    return db.prepare(`
      SELECT id, name, email, role, is_active, created_at
      FROM users WHERE id = ?
    `).get(result.lastInsertRowid);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      const duplicate = new Error("An account with this email already exists.");
      duplicate.status = 409;
      throw duplicate;
    }
    throw error;
  }
}

function authenticateUser(db, email, password, expectedRole) {
  const cleanEmail = normalizeEmail(email);
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);

  // Use the same generic message for unknown email and incorrect password.
  if (!user || !bcrypt.compareSync(String(password || ""), user.password_hash)) {
    return { error: "Invalid email or password." };
  }
  if (!user.is_active) {
    return { error: "This account is inactive. Contact the library administrator." };
  }
  if (expectedRole && user.role !== expectedRole) {
    return { error: "These credentials cannot be used on this login page." };
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active
    }
  };
}

function getPublicUser(db, userId) {
  return db.prepare(`
    SELECT id, name, email, role, is_active, created_at
    FROM users WHERE id = ?
  `).get(userId);
}

module.exports = {
  normalizeEmail,
  validateRegistration,
  registerStudent,
  authenticateUser,
  getPublicUser
};
