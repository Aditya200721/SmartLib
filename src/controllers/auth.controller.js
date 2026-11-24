const { getConfig } = require("../config/env");

const {
  registerStudent,
  authenticateUser,
  getPublicUser
} = require("../services/auth.service");

function createAuthController(db) {
  const config = getConfig();

  function register(req, res, next) {
    try {
      const user = registerStudent(
        db,
        req.body,
        config.bcryptRounds
      );

      // Automatically log in the newly registered student.
      req.session.regenerate((sessionError) => {
        if (sessionError) return next(sessionError);

        req.session.userId = user.id;

        req.session.save((saveError) => {
          if (saveError) return next(saveError);

          return res.status(201).json({
            message: "Student account created successfully.",
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              is_active: user.is_active
            }
          });
        });
      });
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.message
        });
      }

      return next(error);
    }
  }

  function login(req, res, next) {
    const { email, password, role } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required."
      });
    }

    if (
      role !== undefined &&
      !["admin", "student"].includes(role)
    ) {
      return res.status(400).json({
        error: "Invalid login role."
      });
    }

    const result = authenticateUser(
      db,
      email,
      password,
      role
    );

    if (result.error) {
      return res.status(401).json({
        error: result.error
      });
    }

    req.session.regenerate((sessionError) => {
      if (sessionError) return next(sessionError);

      req.session.userId = result.user.id;

      req.session.save((saveError) => {
        if (saveError) return next(saveError);

        return res.status(200).json({
          message: "Login successful.",
          user: result.user
        });
      });
    });
  }

  function logout(req, res, next) {
    if (!req.session) {
      res.clearCookie("smartlib.sid");

      return res.status(200).json({
        message: "Logged out successfully."
      });
    }

    req.session.destroy((error) => {
      if (error) return next(error);

      res.clearCookie("smartlib.sid", {
        httpOnly: true,
        sameSite: "lax",
        secure: config.nodeEnv === "production"
      });

      return res.status(200).json({
        message: "Logged out successfully."
      });
    });
  }

  function me(req, res) {
    if (!req.session || !req.session.userId) {
      return res.status(200).json({
        authenticated: false,
        user: null
      });
    }

    const user = getPublicUser(
      db,
      req.session.userId
    );

    if (!user || !user.is_active) {
      return res.status(200).json({
        authenticated: false,
        user: null
      });
    }

    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_active: user.is_active
      }
    });
  }

  return {
    register,
    login,
    logout,
    me
  };
}

module.exports = { createAuthController };