const rateLimit = require("express-rate-limit");

// Rate limiter for login attempts
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  handler: (req, res) => {
    res.redirect("/login?error=too_many_attempts");
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for OTP requests
const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many OTP attempts. Please wait 10 minutes and try again.",
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for forgot password requests
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  handler: (req, res) => {
    return res.status(429).render("forgot-password", {
      message:
        "Too many password reset requests. Please try again after 15 minutes.",
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginRateLimiter, otpRateLimiter, forgotPasswordLimiter };
