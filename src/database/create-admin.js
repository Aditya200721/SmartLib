
"use strict";

require("dotenv").config();

const { initializeDatabase } = require("./init");
const { closeDatabase } = require("./connection");

function createFirstAdmin(db, email) {
    const normalizedEmail = String(email || "")
        .trim()
        .toLowerCase();

    if (!normalizedEmail) {
        throw new Error("Please provide the registered student email.");
    }

    const transaction = db.transaction(() => {
        const existingAdmin = db.prepare(`
            SELECT id
            FROM users
            WHERE role = 'admin'
              AND is_active = 1
            LIMIT 1
        `).get();

        if (existingAdmin) {
            throw new Error(
                "An active admin already exists. Bootstrap is disabled."
            );
        }

        const user = db.prepare(`
            SELECT id, email, role, is_active
            FROM users
            WHERE email = ?
            LIMIT 1
        `).get(normalizedEmail);

        if (!user) {
            throw new Error(
                "No account found with this email. Register as a student first."
            );
        }

        if (user.is_active !== 1) {
            throw new Error("This account is inactive.");
        }

        if (user.role !== "student") {
            throw new Error(
                "Only an existing student account can be promoted."
            );
        }

        const result = db.prepare(`
            UPDATE users
            SET role = 'admin'
            WHERE id = ?
              AND role = 'student'
              AND is_active = 1
        `).run(user.id);

        if (result.changes !== 1) {
            throw new Error("Admin account creation failed.");
        }

        return user.email;
    });

    return transaction();
}

if (require.main === module) {
    let db;

    try {
        const email = process.argv[2];

        db = initializeDatabase();

        const adminEmail = createFirstAdmin(db, email);

        console.log("\nFirst admin account created successfully.");
        console.log(`Admin email: ${adminEmail}`);
        console.log("You can now use Admin Login.");

    } catch (error) {
        console.error("\nAdmin bootstrap failed:");
        console.error(error.message);
        process.exitCode = 1;

    } finally {
        if (db) {
            closeDatabase();
        }
    }
}

module.exports = { createFirstAdmin };
