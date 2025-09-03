const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const profileController = require('../controllers/user/profileController');
const productController = require('../controllers/user/productController');
const addressController = require('../controllers/user/addressController');
const passport = require('passport');
const { noCache } = require('../middlewares/noCache')
const { uploadProfileImage } = require('../middlewares/multer')


// Error Management
// -----------------
router.get('/pageNotFound', userController.pageNotFound)

// Signup and OTP verifications
// ----------------------------
router.get('/signup', userController.loadSignup)
router.post('/signup', userController.signup)
router.get('/verify-otp', userController.loadOtpPage)
router.post('/verify-otp', userController.verifyOtp)
router.post('/resend-otp', userController.resendOtp)
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }))
router.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/signup" }),
  (req, res) => {
    req.session.user = req.user;
    res.redirect("/");
  },
);

// Login and Logout
// ----------------
router.get('/login', userController.loadLoginPage)
router.post('/login', userController.login)
router.get('/logout', userController.logout)

// Profile Management
// --------------
router.get('/forgot-password',profileController.getForgotPasswordPage)
router.post('/forgot-email-valid',profileController.forgotEmailValid)
router.post('/verify-passForgot-otp',profileController.verifyForgotPassOtp)
router.get('/reset-password',profileController.getResetPassPage)
router.post('/resend-forgot-otp',profileController.resendOtp)
router.post('/reset-password',profileController.newPassword)

router.get('/userProfile',profileController.getProfilePage)
router.post('/uploadProfileImage',uploadProfileImage,profileController.profileImage)
router.get('/change-name',profileController.getChangeNamePage)
router.patch('/change-name',profileController.updateProfileName)
router.get('/change-email',profileController.getChangeEmailPage)
router.post('/change-email',profileController.verifyEmail)
router.post('/verify-changeEmail-otp',profileController.verifyChangeEmailOtp)
router.get('/reset-email',profileController.getResetEmailPage)
router.patch('/reset-email',profileController.newEmail)
router.post('/resend-email-otp',profileController.resendEmailOtp)
router.get('/change-password',profileController.getChangePasswordEmailValid)
router.post('/change-password',profileController.changePasswordValid)
router.post('/verify-change-password-otp',profileController.verifyChangePasswordOtp)

// Address management
// ------------------
router.get('/address',addressController.getAddressPage)
router.get('/add-address',addressController.addAddress)
router.post('/add-address',addressController.postAddAddress)
router.get('/edit-address',addressController.getEditAddressPage)
router.patch('/edit-address/:addressId',addressController.editAddress)
router.delete('/delete-address/:addressId',addressController.deleteAddress)

// Home page
// ---------
router.get('/',noCache, userController.loadHomepage)
router.get('/shop',userController.loadShoppingPage)

// Product Management
// ------------------
router.get('/productDetails',productController.loadProductDetailsPage)


module.exports = router;