const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const Offer = require("../../models/offerSchema");
const nodemailer = require("nodemailer");
const env = require("dotenv").config();
const bcrypt = require("bcrypt");
const { Types } = require("mongoose");
const Wishlist = require("../../models/wishlistSchema");

// Controller to handle 404 (Page Not Found) errors
const pageNotFound = (req, res) => {
  try {
    res.status(404).render("page-404");
  } catch (error) {
    console.error("[404 page error]", error);
    res.status(500).send("Something went wrong. Please try again later.");
  }
};

// Controller to render the signup page
const loadSignup = async (req, res) => {
  try {
    if (req.session.user) {
      return res.redirect("/");
    }

    res.render("signup", { message: null });
  } catch (error) {
    console.error("[Signup Page Load Error]", error);
    res.status(500).render("page-404");
  }
};

// Function to generate a 6-digit numeric OTP as a string
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    // Configure the email transport using Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    // Prepare the email content
    const info = await transporter.sendMail({
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
    console.error("[Error in sending email.]", error);
    return false;
  }
}

// Controller for handling user signup
const signup = async (req, res) => {
  try {
    const { name, phone, email, password, confirmPassword, referralCode } = req.body;

    if (password !== confirmPassword) {
      return res.render("signup", { message: "Passwords do not match" });
    }

    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render("signup", {
        message: "An account with this email already exists",
      });
    }

    let referrer = null;
    if(referralCode){
      referrer = await User.findOne({referralCode})
      if(!referrer){
        return res.render('signup',{
          message:'Invalid referral code'
        })
      }
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to send verification email" });
    }

    req.session.userOtp = otp;
    req.session.otpSentAt = new Date();
    req.session.userData = { name, phone, email, password, referredBy: referrer ? referrer._id : null };

    res.redirect("/verify-otp");

    console.log("Otp sent: ", otp);
  } catch (error) {
    console.error("[Signup error]", error);
    res.status(500).render("page-404");
  }
};

// Utility function to securely hash a password using bcrypt
const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {
    console.error("Error while hashing password:", error);
    return null;
  }
};

// Controller to load the OTP verification page
const loadOtpPage = async (req, res) => {
  try {
    if (req.session.user) {
      return res.redirect("/");
    }

    if (!req.session.userData || !req.session.userOtp) {
      return res.redirect("/signup");
    }

    res.render("verify-otp", { otpSentAt: req.session.otpSentAt });
  } catch (error) {
    console.error("[Error loading OTP page]", error);
    res.status(500).render("page-404");
  }
};

// Controller to verify the OTP entered by the user
const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (otp === req.session.userOtp) {
      const user = req.session.userData;

      const passwordHash = await securePassword(user.password);

      const generateReferralCode = (name) => {
        return(
          name.substring(0,3).toUpperCase()+Math.random().toString(36).substring(2,6).toUpperCase()
        )
      }

      const saveUserData = new User({
        name: user.name,
        email: user.email,
        phone: user.phone,
        password: passwordHash,
        referralCode: generateReferralCode(user.name),
        referredBy: user.referredBy
      });

      await saveUserData.save();

      //referral reward

      if(saveUserData.referredBy && !saveUserData.referralRewardCredited){
        const referrer = await User.findById(saveUserData.referredBy)
        if(referrer){
          referrer.wallet.balance += 100
          referrer.wallet.transactions.push({
            type:'referral',
            amount:100,
            description:'Referral reward for new signup',
            status:'completed'
          });
          await referrer.save()
          saveUserData.referralRewardCredited = true
          await saveUserData.save()
        }
      }

    

      delete req.session.userOtp
      delete req.session.userData

      req.session.user = saveUserData._id;

      res.json({ success: true, redirectUrl: "/" });
    } else {
      res.json({ success: false, message: "Invalid OTP. Please try again." });
    }
  } catch (error) {
    console.error("[Error verifying OTP]", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred. Please try again later.",
    });
  }
};

// Controller to handle resending OTP
const resendOtp = async (req, res) => {
  try {
    const { email } = req.session.userData;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email not found in session" });
    }

    const now = new Date();
    const lastSent = req.session.otpSentAt;

    if (lastSent && now - new Date(lastSent) < 60000) {
      const secondsLeft = 60 - Math.floor((now - new Date(lastSent)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${secondsLeft}s before resending OTP`,
      });
    }

    const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpSentAt = now;

    const emailSent = await sendVerificationEmail(email, otp);

    if (emailSent) {
      console.log("Resend OTP:", otp);
      res.status(200).json({
        success: true,
        message: "OTP resent successfully",
        otpSentAt: now,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to resend the OTP. Please try again",
      });
    }
  } catch (error) {
    console.error("Error resending OTP", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error. Please try again later.",
    });
  }
};

// Controller to showing the login page to users
const loadLoginPage = async (req, res) => {
  try {
    if (req.session.user) {
      return res.redirect("/");
    }
    res.render("login", { message: null });
  } catch (error) {
    console.error("[Login page load error]", error);
    res.redirect("/pageNotFound");
  }
};

// Controller to handle user login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const findUser = await User.findOne({ isAdmin: false, email });

    if (!findUser) {
      return res.render("login", { message: "Invalid Credentials" });
    }

    if (findUser.isBlocked) {
      return res.render("login", { message: "User is blocked by admin" });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);

    if (!passwordMatch) {
      return res.render("login", { message: "Invalid Credentials" });
    }

    req.session.user = findUser._id;

    res.redirect("/");
  } catch (error) {
    console.error("[Login error]", error);
    res.render("login", { message: "Login failed. Please try again later." });
  }
};

// Controller to handle user logout
const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log("Session destruction error", err);
        return res.redirect("/pageNotFound");
      }

      // Clear the session cookie manually
      res.clearCookie("connect.sid", {
        httpOnly: true,
        sameSite: "Strict",
        secure: false,
      });

      console.log("Session destroyed");
      return res.redirect("/login");
    });
  } catch (error) {
    console.log("Logout error:", error);
    res.redirect("/pageError");
  }
};

// Controller to render the home page
const loadHomepage = async (req, res) => {
  try {
    const userId = req.session.user;

    let wishlistIds = [];
    if(userId){
      const wishlist = await Wishlist.findOne({userId})
      wishlistIds = wishlist ? wishlist.products.map(p => p.productId.toString()) : []
    }

    const categories = await Category.find({
      isListed: true,
      isDeleted: false,
    });
    let productData = await Product.find({
      isListed: true,
      isDeleted: false,
      category: { $in: categories.map((category) => category._id) },
    })
      .populate("category","name")
      .sort({ createdAt: -1 })
      .limit(4);

    const bestSelling = await Order.aggregate([
      { $unwind: "$orderItems" },
      {
        $group: {
          _id: "$orderItems.product",
          totalSold: { $sum: "$orderItems.quantity" },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $lookup:{
          from:"categories",
          localField:"product.category",
          foreignField:"_id",
          as:"category"
        }
      },
      {$unwind:"$category"},
      {
        $match: {
          "product.isListed": true,
          "product.isDeleted": false,
          "category.isListed":true,
          "category.isDeleted":false
        },
      },
      { $sort: { totalSold: -1 } },
    ]);

    let bestSellingProducts = [];
    if (bestSelling.length > 0) {
      const maxSold = bestSelling[0].totalSold;
      bestSellingProducts = bestSelling.filter(
        (item) => item.totalSold === maxSold,
      );
    }

    const userData = userId ? await User.findById(userId) : null;

    res.status(200).render("home", {
      user: userData,
      products: productData,
      bestSellingProducts,
      wishlistIds
    });
  } catch (error) {
    console.error("[Home page load error]", error);
    res
      .status(500)
      .send("An unexpected error occurred. Please try again later.");
  }
};

const loadShoppingPage = async (req, res) => {
  try {
    let page = Math.max(1, parseInt(req.query.page) || 1);
    let limit = 6;
    let skip = (page - 1) * limit;

    const search = req.query.search ? req.query.search.trim() : "";
    const category = req.query.category || "";
    const minPrice = parseFloat(req.query.minPrice);
    const maxPrice = parseFloat(req.query.maxPrice);
    const sort = req.query.sort || "";

    let userData = null;
    if (req.session.user) {
      userData = await User.findById(req.session.user);
    }

    let wishlistIds = [];
    if(req.session.user){
      const wishlist = await Wishlist.findOne({userId:req.session.user})
      wishlistIds = wishlist ? wishlist.products.map(p => p.productId.toString()) : []
    }

    const match = {
      isListed: true,
      isDeleted: false,
      price: { $gt: 0 },
    };

    if (minPrice) match.price = { $gte: minPrice };
    if (maxPrice) match.price = { ...match.price, $lte: maxPrice };
    if (search) match.productName = { $regex: search, $options: "i" };
    if (category && Types.ObjectId.isValid(category)) {
      match.category = new Types.ObjectId(category);
    }

    let sortOptions = {};
    switch (sort) {
      case "priceLowHigh":
        sortOptions.price = 1;
        break;
      case "priceHighLow":
        sortOptions.price = -1;
        break;
      case "a-z":
        sortOptions.productName = 1;
        break;
      case "z-a":
        sortOptions.productName = -1;
        break;
      default:
        sortOptions.createdAt = -1;
    }

    const agg = await Product.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      { $match: { "category.isListed": true, "category.isDeleted": false } },
      { $sort: sortOptions },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                productName: 1,
                price: 1,
                quantity: 1,
                productImage: 1,
                createdAt: 1,
                category: { _id: "$category._id", name: "$category.name" },
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const products = agg[0]?.data || [];
    const totalProducts = agg[0]?.total?.[0]?.count || 0;
    const totalPages = Math.ceil(totalProducts / limit);

    const categories = await Category.find({
      isListed: true,
      isDeleted: false,
    }).lean();

    const now = new Date();
    const activeOffers = await Offer.find({
      isDeleted: false,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    const productOfferMap = new Map();
    const categoryOfferMap = new Map();

    activeOffers.forEach((offer) => {
      if (offer.appliesTo === "product") {
        offer.targetIds.forEach((id) => {
          productOfferMap.set(id.toString(), offer.discountValue);
        });
      } else if (offer.appliesTo === "category") {
        offer.targetIds.forEach((id) => {
          categoryOfferMap.set(id.toString(), offer.discountValue);
        });
      }
    });

    const productsWithOffers = products.map((product) => {
      const productDiscount = productOfferMap.get(product._id.toString()) || 0;

      const categoryDiscount =
        categoryOfferMap.get(product.category._id.toString()) || 0;

      //Pick the higher discount
      const discountValue = Math.max(productDiscount, categoryDiscount);

      return {
        ...product,
        discountValue,
      };
    });


    res.render("shop", {
      products: productsWithOffers,
      wishlistIds,
      totalPages,
      categories,
      currentPage: page,
      search,
      category,
      minPrice,
      maxPrice,
      sort,
      limit,
      totalProducts,
      user: userData,
    });
  } catch (error) {
    console.error("[Error loading shop page]", error);
    res.status(500).render("page-404");
  }
};

module.exports = {
  pageNotFound,
  loadSignup,
  signup,
  loadOtpPage,
  verifyOtp,
  resendOtp,
  loadLoginPage,
  login,
  logout,
  loadHomepage,
  loadShoppingPage,
};
