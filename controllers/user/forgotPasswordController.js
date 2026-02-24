const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const env = require("dotenv").config();
const session = require("express-session");

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transport = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const info = await transport.sendMail({
      from: `"The Untold Stories 📖" <${process.env.NODEMAILER_EMAIL}>`,
      to: email,
      subject: "Verify Your Email Address",
      text: `Your OTP is: ${otp}`,
      html: ` <div style="font-family: Arial, sans-serif; padding: 10px;">
                    <h2>🔐 Email Verification</h2>
                    <p>Your One Time Password (OTP) is:</p>
                    <h3 style="color: #fca311;">${otp}</h3>
                    <p>This OTP will expire in 60 seconds. Please do not share it with anyone.</p>
                    </div>  `,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error("[Email sending failed.]", error);
    return false;
  }
}

const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {
    console.error("Error while hashing password:", error);
    return null;
  }
};

const getForgotPasswordPage = async (req, res) => {
  try {
    res.render("forgot-password", { message: null });
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const forgotEmailValid = async (req, res) => {
  try {
    const { email } = req.body;
    const findUser = await User.findOne({ email: email });
    if (!findUser) {
      return res.render("forgot-password", {
        message:
          "No account found with this email. Please check the email or sign up for a new account.",
      });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.render("forgot-password", {
        message: "Failed to send OTP. Please try again.",
      });
    }

    req.session.userOtp = otp;
    req.session.email = email;
    req.session.otpSentAt = new Date();

    res.render("forgotPass-otp", { otpSentAt: req.session.otpSentAt });

    console.log("Otp sent: ", otp);
  } catch (error) {
    console.error("[Email validation error]", error);
    res.redirect("/pageNotFound");
  }
};

const verifyForgotPassOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (otp === req.session.userOtp) {
      res.json({ success: true, redirectUrl: "/reset-password" });
    } else {
      res.json({ success: false, message: "OTP not matching" });
    }
  } catch (error) {
    console.error("[otp verification error]", error);
    res.redirect("/pageNotFound");
  }
};

const getResetPassPage = async (req, res) => {
  try {
    res.render("reset-password");
  } catch (error) {
    console.error("[rendering reset password page error]", error);
    res.redirect("/pageNotFound");
  }
};

const resendOtp = async (req, res) => {
  try {
    const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpSentAt = new Date();
    const email = req.session.email;

    console.log("Resending otp to email: ", email);

    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.json({
        success: false,
        message: "Failed to send OTP. Please try again.",
      });
    }

    console.log("Resend otp: ", otp);

    return res.json({
      success: true,
      message: "A new OTP has been sent to your email.",
      otpSentAt: req.session.otpSentAt,
    });
  } catch (error) {
    console.error("[resend otp error]", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

const newPassword = async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;
    const email = req.session.email;
    if (password === confirmPassword) {
      const passwordHash = await securePassword(password);
      await User.updateOne(
        { email: email },
        { $set: { password: passwordHash } },
      );
      res.redirect("/login");
    } else {
      res.render("reset-password", { message: "Passwords do not match" });
    }
  } catch (error) {
    console.error("[Error checking password ]", error);
    res.redirect("/pageNotFound");
  }
};

module.exports = {
  getForgotPasswordPage,
  forgotEmailValid,
  verifyForgotPassOtp,
  getResetPassPage,
  resendOtp,
  newPassword,
};
