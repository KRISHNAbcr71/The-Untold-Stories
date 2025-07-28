const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const passport = require('passport');
const { noCache } = require('../middlewares/noCache')

router.get('/pageNotFound', userController.pageNotFound)

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

router.get('/login', userController.loadLoginPage)
router.post('/login', userController.login)
router.get('/logout', userController.logout)
router.get('/',noCache, userController.loadHomepage)



module.exports = router;