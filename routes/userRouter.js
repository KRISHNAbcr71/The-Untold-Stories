const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userController");
const profileController = require("../controllers/user/profileController");
const productController = require("../controllers/user/productController");
const addressController = require("../controllers/user/addressController");
const cartController = require("../controllers/user/cartController");
const wishlistController = require("../controllers/user/wishlistController");
const orderController = require("../controllers/user/orderController");
const couponController = require("../controllers/user/couponController");
const walletController = require("../controllers/user/walletController");
const passport = require("passport");
const { userAuth } = require("../middlewares/auth");
const { uploadProfileImage } = require("../middlewares/multer");




// Error Management
// -----------------
router.get("/pageNotFound", userController.pageNotFound);




// Signup and OTP verifications
// ----------------------------
router.get("/signup", userController.loadSignup);
router.post("/signup", userController.signup);
router.get("/verify-otp", userController.loadOtpPage);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);
router.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  }),
);
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/signup" }),
  (req, res) => {
    req.session.user = req.user._id;
    res.redirect("/");
  },
);




// Login and Logout
// ----------------
router.get("/login", userController.loadLoginPage);
router.post("/login", userController.login);
router.get("/logout", userController.logout);




// Forgot Password
// --------------
router.get("/forgot-password", profileController.getForgotPasswordPage);
router.post("/forgot-email-valid", profileController.forgotEmailValid);
router.post("/verify-passForgot-otp", profileController.verifyForgotPassOtp);
router.get("/reset-password", profileController.getResetPassPage);
router.post("/resend-forgot-otp", profileController.resendOtp);
router.post("/reset-password", profileController.newPassword);




// Profile Management
// ------------------
router.get("/userProfile", userAuth, profileController.getProfilePage);
router.post("/uploadProfileImage",userAuth,uploadProfileImage,profileController.profileImage,);
router.get("/change-name", userAuth, profileController.getChangeNamePage);
router.patch("/change-name", userAuth, profileController.updateProfileName);
router.get("/change-email", userAuth, profileController.getChangeEmailPage);
router.post("/change-email", userAuth, profileController.verifyEmail);
router.post("/verify-changeEmail-otp",userAuth,profileController.verifyChangeEmailOtp);
router.get("/reset-email", userAuth, profileController.getResetEmailPage);
router.patch("/reset-email", userAuth, profileController.newEmail);
router.post("/resend-email-otp", userAuth, profileController.resendEmailOtp);
router.get("/change-password",userAuth,profileController.getChangePasswordEmailValid);
router.post("/change-password", userAuth, profileController.changePassword);




// Address management
// ------------------
router.get("/address", userAuth, addressController.getAddressPage);
router.get("/add-address", userAuth, addressController.addAddress);
router.post("/add-address", userAuth, addressController.postAddAddress);
router.get("/edit-address", userAuth, addressController.getEditAddressPage);
router.patch("/edit-address/:addressId",userAuth,addressController.editAddress);
router.delete("/delete-address/:addressId",userAuth,addressController.deleteAddress);



// Home, Shop, and Product detail page
// -----------------------------------
router.get("/", userController.loadHomepage);
router.get("/shop", userController.loadShoppingPage);
router.get("/productDetails", productController.loadProductDetailsPage);




// Cart Management
// ---------------
router.get("/cart", userAuth, cartController.getCartPage);
router.post("/add-to-cart/:productId", cartController.addToCart);
router.post("/increase/:productId", userAuth, cartController.increaseQuantity);
router.post("/decrease/:productId", userAuth, cartController.decreaseQuantity);
router.delete("/deleteFromCart/:productId",userAuth,cartController.deleteFromCart);
router.get("/cart-count", userAuth, cartController.getCartCount);



// Wishlist Mangement
// ------------------
router.get("/wishlist", userAuth, wishlistController.getWishlistPage);
router.post("/add-to-wishlist/:productId", wishlistController.addToWishlist);
router.delete("/deleteFromWishlist/:productId",wishlistController.deleteFromWishlist);
router.get("/wishlist-count", userAuth, wishlistController.getWishlistCount);




// Coupon Management
// -----------------
router.get("/coupon", userAuth, couponController.getCoupons);
router.post("/apply-coupon", userAuth, couponController.applyCoupon);
router.post("/remove-coupon", userAuth, couponController.removeCoupon);




// Checkout Management
// -------------------
router.get("/checkout", userAuth, orderController.getCheckoutPage);
router.post("/place-order", userAuth, orderController.placeOrder);
router.post("/verify-payment", userAuth, orderController.verifyPayment);
router.get("/order-success", userAuth, orderController.orderSuccess);
router.get("/order-failed/:orderId", userAuth, orderController.orderFailed);
router.post("/retry-payment/:orderId", userAuth, orderController.retryPayment);




// Order Management
// ----------------
router.get("/my-order", userAuth, orderController.getMyOrderPage);
router.post("/cancel-product/:orderId/:productId",orderController.cancelSpecificProduct);
router.post("/cancel-order/:orderId", orderController.cancelOrder);
router.get("/view-order-details/:orderId", orderController.viewOrderDetails);
router.post("/return-order/:orderId", orderController.returnOrder);
router.get("/invoice/:orderId", orderController.getInvoicePage);
router.get("/invoice/:orderId/download", orderController.downloadInvoice);




// Wallet
// ------
router.get("/wallet", userAuth, walletController.getWallet);
router.post("/add-money-order", userAuth, walletController.createAddMoneyOrder);
router.post("/add-money-verify",userAuth,walletController.verifyAddMoneyPayment);
router.post("/withdraw", userAuth, walletController.withdrawMoney);
router.post("/wallet/payment-failed", userAuth, walletController.paymentFailed);
router.post("/use-wallet-payment", walletController.useWalletForPayment);




module.exports = router;
