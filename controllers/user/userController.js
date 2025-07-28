const User = require('../../models/userSchema')
const nodemailer = require('nodemailer')
const env = require('dotenv').config()
const bcrypt = require('bcrypt')





// Controller to handle 404 (Page Not Found) errors
const pageNotFound = async (req, res) => {
    try {
        res.status(404).render('page-404')
    } catch (error) {
        console.error('[404 page error]', error)
        res.status(500).send('Something went wrong. Please try again later.')
    }
};





// Controller to render the home page
const loadHomepage = async (req, res) => {
    try {
        const userId = req.session.user;

        if (userId) {
            const userData = await User.findById(userId)

            res.status(200).render('home', { user: userData })
        } else {
            res.status(200).render('home', { user: null })
        }

    } catch (error) {
        console.error('[Home page load error]', error)
        res.status(500).send('An unexpected error occurred. Please try again later.')
    }
};







// Controller to render the signup page
const loadSignup = async (req, res) => {
    try {

        if (req.session.user) {
            return res.redirect('/');
        }

        res.render('signup', { message: null });

    } catch (error) {
        console.error('[Signup Page Load Error]', error);
        res.redirect('/pageNotFound');
    }
};






// Function to generate a 6-digit numeric OTP as a string
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString()
};

// Sends a verification email containing a 6-digit OTP to the provided email address
async function sendVerificationEmail(email, otp) {
    try {
        // Configure the email transport using Gmail SMTP
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        // Prepare the email content
        const info = await transporter.sendMail({
            from: `"The Untold Stories 📖" <${process.env.NODEMAILER_EMAIL}>`,
            to: email,
            subject: 'Verify Your Email Address',
            text: `Your OTP is: ${otp}`,
            html: ` <div style="font-family: Arial, sans-serif; padding: 10px;">
                    <h2>🔐 Email Verification</h2>
                    <p>Your One Time Password (OTP) is:</p>
                    <h3 style="color: #fca311;">${otp}</h3>
                    <p>This OTP will expire in 60 seconds. Please do not share it with anyone.</p>
                    </div>  `

        });

        // Return true if email is accepted by any recipient
        return info.accepted.length > 0

    } catch (error) {
        console.error('[Email sending failed.]', error)
        return false
    }
};

// Controller for handling user signup
const signup = async (req, res) => {
    try {
        const { name, phone, email, password, confirmPassword } = req.body

        if (password !== confirmPassword) {
            return res.render('signup', { message: 'Passwords do not match' })
        }

        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.render('signup', { message: 'An account with this email already exists' })
        }

        const otp = generateOtp()
        const emailSent = await sendVerificationEmail(email, otp)

        if (!emailSent) {
            //console.error('Failed to send verification email');
            return res.status(500).json({ success: false, message: 'Failed to send verification email' });
        }

        req.session.userOtp = otp;
        req.session.otpSentAt = new Date();  //current date and time
        req.session.userData = { name, phone, email, password }

        // res.render('verify-otp')
        res.redirect('/verify-otp')

        console.log('Otp sent: ', otp);

    } catch (error) {
        console.error('[Signup error]', error)
        res.redirect('/pageNotFound')
    }
};






// Utility function to securely hash a password using bcrypt
const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10)
        return passwordHash
    } catch (error) {
        console.error('Error while hashing password:', error);
        return null;
    }
};





// Controller to load the OTP verification page

const loadOtpPage = async (req, res) => {
    try {
        // If user is already logged in, redirect to home
        if (req.session.user) {
            return res.redirect('/');
        }

        // If no userData in session (i.e., came without signing up), redirect to signup
        if (!req.session.userData || !req.session.userOtp) {
            return res.redirect('/signup');
        }

        // Render the OTP verification page
        res.render('verify-otp', { otpSentAt: req.session.otpSentAt });

    } catch (error) {
        console.error('[Error loading OTP page]', error);
        res.status(500).render('error-page', { message: 'Something went wrong while loading OTP page' });
    }
};






// Controller to verify the OTP entered by the user
const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body

        if (otp === req.session.userOtp) {
            const user = req.session.userData

            const passwordHash = await securePassword(user.password)

            // Create a new user document
            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash
            })

            await saveUserData.save()

            req.session.user = saveUserData._id

            res.json({ success: true, redirectUrl: '/' })
        } else {
            res.json({ success: false, message: 'Invalid OTP. Please try again.' })
        }

    } catch (error) {
        console.error('[Error verifying OTP]', error)
        res.status(500).json({ success: false, message: 'An unexpected error occurred. Please try again later.' })
    }
};





// Controller to handle resending OTP
const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email not found in session' })
        }

        const now = new Date();
        const lastSent = req.session.otpSentAt;

        // Allow resend only after 60 seconds
        if (lastSent && now - new Date(lastSent) < 60000) {
            const secondsLeft = 60 - Math.floor((now - new Date(lastSent)) / 1000);
            return res.status(429).json({
                success: false,
                message: `Please wait ${secondsLeft}s before resending OTP`
            });
        }

        const otp = generateOtp();
        req.session.userOtp = otp;
        req.session.otpSentAt = now;

        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            console.log('Resend OTP:', otp);
            res.status(200).json({
                success: true,
                message: 'OTP resent successfully',
                otpSentAt: now  // Send this to frontend
            });
        } else {
            res.status(500).json({ success: false, message: 'Failed to resend the OTP. Please try again' });
        }

    } catch (error) {
        console.error('Error resending OTP', error);
        res.status(500).json({ success: false, message: 'Internal Server Error. Please try again later.' })
    }
};




// Controller to showing the login page to users
const loadLoginPage = async (req, res) => {
    try {

        if (req.session.user) {
            return res.redirect('/');
        }
        res.render('login', { message: null });
    } catch (error) {
        console.error('[Login page load error]', error)
        res.redirect('/pageNotFound')
    }
};





// Controller to handle user login
const login = async (req, res) => {
    try {
        const { email, password } = req.body

        const findUser = await User.findOne({ isAdmin: false, email })

        if (!findUser) {
            return res.render('login', { message: 'User not found' })
        }

        if (findUser.isBlocked) {
            return res.render('login', { message: 'User is blocked by admin' })
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password)

        if (!passwordMatch) {
            return res.render('login', { message: 'Incorrect password' })
        }

        req.session.user = findUser._id

        res.redirect('/')

    } catch (error) {

        console.error('[Login error]', error)
        res.render('login', { message: 'Login failed. Please try again later.' })

    }
}





// Controller to handle user logout
const logout = async (req, res) => {
    try {
        req.session.destroy(err => {
            if (err) {
                console.log('Session destruction error', err)
                return res.redirect('/pageNotFound')
            }

            // Clear the session cookie manually
            res.clearCookie('connect.sid', {
                httpOnly: true,
                sameSite: 'Strict',
                secure: false
            });

            console.log('Session destroyed');
            return res.redirect('/login');
        })

    } catch (error) {
        console.log("Logout error:", error);
        // res.status(500).json({ message: "Server error during logout" });
        res.redirect('/pageError')
    }
};








module.exports = {
    pageNotFound,
    loadHomepage,
    loadSignup,
    signup,
    loadOtpPage,
    verifyOtp,
    resendOtp,
    loadLoginPage,
    login,
    logout

};