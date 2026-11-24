
"use strict";

const session = require("express-session");

const CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes

class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();

    if (!db) {
      throw new Error("SQLiteSessionStore requires a database connection.");
    }

    this.db = db;

    this.getStatement = db.prepare(
      "SELECT sess, expired FROM sessions WHERE sid = ?"
    );

    this.setStatement = db.prepare(`
      INSERT INTO sessions (sid, sess, expired)
      VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE
      SET sess = excluded.sess,
          expired = excluded.expired
    `);

    this.destroyStatement = db.prepare(
      "DELETE FROM sessions WHERE sid = ?"
    );

    this.touchStatement = db.prepare(
      "UPDATE sessions SET expired = ?, sess = ? WHERE sid = ?"
    );

    this.deleteExpiredStatement = db.prepare(
      "DELETE FROM sessions WHERE expired <= ?"
    );

    // Remove expired sessions when the store starts.
    this.pruneExpired();

    // Periodically remove expired sessions.
    this.cleanupTimer = setInterval(() => {
      try {
        this.pruneExpired();
      } catch (error) {
        console.error("SMART LIB session cleanup failed:", error.message);
      }
    }, CLEANUP_INTERVAL);

    // Prevent the timer from keeping Node.js alive.
    this.cleanupTimer.unref();
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid);

      if (!row) {
        return callback(null, null);
      }

      if (row.expired <= Date.now()) {
        this.destroyStatement.run(sid);
        return callback(null, null);
      }

      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expires =
        sess.cookie && sess.cookie.expires
          ? new Date(sess.cookie.expires).getTime()
          : Date.now() +
            (sess.cookie && sess.cookie.maxAge
              ? sess.cookie.maxAge
              : 86400000);

      this.setStatement.run(sid, JSON.stringify(sess), expires);

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.destroyStatement.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      const expires =
        sess.cookie && sess.cookie.expires
          ? new Date(sess.cookie.expires).getTime()
          : Date.now() +
            (sess.cookie && sess.cookie.maxAge
              ? sess.cookie.maxAge
              : 86400000);

      this.touchStatement.run(expires, JSON.stringify(sess), sid);

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  pruneExpired() {
    return this.deleteExpiredStatement.run(Date.now()).changes;
  }

  close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

module.exports = { SQLiteSessionStore };
