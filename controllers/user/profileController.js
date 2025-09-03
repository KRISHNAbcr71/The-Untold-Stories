const User = require('../../models/userSchema')
const nodemailer = require('nodemailer')
const bcrypt = require('bcrypt')
const env = require('dotenv').config()
const session = require('express-session')





function generateOtp(){
    return Math.floor(100000 + Math.random() * 900000).toString()
}

async function sendVerificationEmail(email,otp){
    try {
        const transport = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const info = await transport.sendMail({
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

        return info.accepted.length > 0

    } catch (error) {
        console.error('[Email sending failed.]', error)
        return false
    }
}



const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10)
        return passwordHash
    } catch (error) {
        console.error('Error while hashing password:', error);
        return null;
    }
};





const getForgotPasswordPage = async(req,res)=>{
    try {
        res.render('forgot-password',{message:null})
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}



const forgotEmailValid = async(req,res)=>{
    try {
        const {email} = req.body
        const findUser = await User.findOne({email:email})
        if(!findUser){
            return res.render('forgot-password',{message: 'No account found with this email. Please check the email or sign up for a new account.'})
        }

        const otp = generateOtp()
        const emailSent = await sendVerificationEmail(email,otp)

        if(!emailSent){
            return res.render('forgot-password',{message:'Failed to send OTP. Please try again.'})
        }

        req.session.userOtp = otp
        req.session.email = email
        req.session.otpSentAt = new Date();

        res.render('forgotPass-otp',{ otpSentAt: req.session.otpSentAt })

        console.log('Otp sent: ', otp);

    } catch (error) {
        console.error('[Email validation error]', error)
        res.redirect('/pageNotFound')
    }
}




const verifyForgotPassOtp = async(req,res)=>{
    try {
        const {otp} = req.body
        if(otp === req.session.userOtp){
            res.json({success:true, redirectUrl:'/reset-password'})
        }else{
            res.json({success:false, message:'OTP not matching'})
        }
    } catch (error) {
        console.error('[otp verification error]', error)
        res.redirect('/pageNotFound')
    }
}



const getResetPassPage = async(req,res)=>{
    try {
        res.render('reset-password')
    } catch (error) {
        console.error('[rendering reset password page error]', error)
        res.redirect('/pageNotFound')
    }
}



const resendOtp = async (req, res) => {
  try {
    const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpSentAt = new Date();
    const email = req.session.email;

    console.log('Resending otp to email: ', email);

    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }

    console.log('Resend otp: ',otp);

    return res.json({
      success: true,
      message: 'A new OTP has been sent to your email.',
      otpSentAt: req.session.otpSentAt
    });

  } catch (error) {
    console.error('[resend otp error]', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
};



const newPassword = async(req,res)=>{
    try {
        const {password,confirmPassword} = req.body
        const email = req.session.email
        if(password === confirmPassword){
            const passwordHash = await securePassword(password)
            await User.updateOne(
                {email:email},
                {$set:{password:passwordHash}}
            )
            res.redirect('/login')
        }else{
            res.render('reset-password',{message:'Passwords do not match'})
        }
    } catch (error) {
        console.error('[Error checking password ]', error)
        res.redirect('/pageNotFound')
    }
}




const getProfilePage = async(req,res) => {
    try {
        const userId = req.session.user
        const userData = await User.findById(userId)
        res.render('profile', {user: userData})
    } catch (error) {
        console.error('[Error in loading user profile page]',error)
        res.status(500).render('page-404')
    }
}




const profileImage = async(req,res) => {
    try {
        const userId = req.session.user

        if (!userId) return res.status(401).json({ message: "Not logged in" });

        if (!req.file) {
            return res.status(400).json({ success: false, error: "No file uploaded" });
        }

        const filePath = req.file.path.replace(/\\/g, "/").replace(/^public\//, "");

        await User.findByIdAndUpdate(userId, {profileImage: filePath})

        res.json({success: true, filename: filePath})
    } catch (error) {
        console.error('[Error in uploading profile image]',error)
        res.status(500).json({success: false, error: 'Upload failed'})
    }
}




const getChangeNamePage = async(req,res) => {
    try {

        if(!req.session.user) {
            return res.redirect('/login')
        }

        const user = await User.findById(req.session.user)

        if(!user) {
            return res.status(404).render('page-404')
        }

        res.render('change-name',{user})

    } catch (error) {
        console.error('[Error in loading change name page]',error)
        res.status(500).render('page-404')
    }
}


const updateProfileName = async(req,res) => {
    try {

        if(!req.session.user){
            return res.status(401).json({error:'Unauthorized'});
        }

        const userName = req.body.name?.trim()
        if(!userName){
            return res.status(400).json({error:'Name can not be empty'})
        }

        const userId = req.session.user
        const user = await User.findById(userId);

        if(!user) {
            return res.status(404).json({error:'User not found'})
        }

        if(user.name === userName){
            return res.status(400).json({error:'Name is same as current name'})
        }

        user.name = userName;
        await user.save();
        
        res.json({message:'Profile name updated successfully'})
        
    } catch (error) {
        console.error('[Error in updating profile name]',error)
        res.status(500).json({error:'Somethign went wrong'})
    }
}





const getChangeEmailPage = async(req,res) => {
    try {

        if(!req.session.user) {
            return res.redirect('/login')
        }

        const user = await User.findById(req.session.user)

        if(!user){
            return res.status(404).render('page-404')
        }

        res.render('change-email',{user})

    } catch (error) {
        console.error('[Error in loading change email page]',error)
        res.status(500).render('page-404')
    }
}



const verifyEmail = async(req,res)=>{
    try {

        const {email} = req.body

        const userExists = await User.findOne({email})

        if(userExists){
            const otp = generateOtp()
            const emailSent = await sendVerificationEmail(email,otp)

            if(!emailSent){
                return res.render('change-email',{message:'Failed to send OTP. Please try again.'})
            }   

            req.session.userOtp = otp
            // req.session.userData = req.body
            req.session.email = email
            req.session.otpSentAt = new Date();

            res.render('change-email-otp',{ otpSentAt: req.session.otpSentAt })
            console.log('Email sent: ', email);
            console.log('OTP: ', otp);
            
            
        }else{
            res.render('change-email',{message:'User with thie email not exist'})
        }

        
    } catch (error) {
        console.error('[Error in change email]',error)
        res.status(500).render('page-404')
    }
}




const verifyChangeEmailOtp = async(req,res)=>{
    try {
        const {otp} = req.body
        if(otp === req.session.userOtp){
            res.json({success:true, redirectUrl:'/reset-email'})
        }else{
            res.json({success:false, message:'OTP not matching'})
        }
    } catch (error) {
        console.error('[otp verification error]', error)
        res.redirect('/pageNotFound')
    }
}




const getResetEmailPage = async(req,res)=>{
    try {
        res.render('reset-email')
    } catch (error) {
        console.error('[rendering reset password page error]', error)
        res.redirect('/pageNotFound')
    }
}


const newEmail = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const newEmail = req.body.email?.trim();
    if (!newEmail) {
      return res.status(400).json({ error: 'Email cannot be empty' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const userId = req.session.user;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.email === newEmail) {
      return res.status(400).json({ error: 'Email is same as current email' });
    }

    const emailTaken = await User.findOne({ email: newEmail });
    if (emailTaken) {
      return res.status(400).json({ error: 'This email is already in use' });
    }

    user.email = newEmail;
    await user.save();

    res.json({ message: 'Email updated successfully' });

  } catch (error) {
    console.error('[Error in updating email]', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};




const resendEmailOtp = async(req,res) => {
    try {
        const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpSentAt = new Date();
    const email = req.session.email;

    console.log('Resending otp to email: ', email);

    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }

    console.log('Resend otp: ',otp);

    return res.json({
      success: true,
      message: 'A new OTP has been sent to your email.',
      otpSentAt: req.session.otpSentAt
    });
    } catch (error) {
        console.error('[resend otp error]', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
    }
}





const getChangePasswordEmailValid = async(req,res) => {
    try {
        res.render('change-password-email')
    } catch (error) {
        console.error('[Error in email page for changing password]',error)
        res.redirect('/pageNotFound')
    }
}



const changePasswordValid = async(req,res) => {
    try {
        const {email} = req.body

        const userExists = await User.findOne({email})

        if(userExists){
            const otp = generateOtp()
            const emailSent = await sendVerificationEmail(email,otp)

            if(!emailSent){
                return res.render('change-email',{message:'Failed to send OTP. Please try again.'})
            }   

            req.session.userOtp = otp
            // req.session.userData = req.body
            req.session.email = email
            req.session.otpSentAt = new Date();

            res.render('change-password-otp',{ otpSentAt: req.session.otpSentAt })
            console.log('Email sent: ', email);
            console.log('OTP: ', otp);
            
            
        }else{
            res.render('change-email',{message:'User with thie email not exist'})
        }
        
    } catch (error) {
        console.error('[Error in change password validation]',error)
        res.status(500).render('page-404')
    }
}





const verifyChangePasswordOtp = async(req,res) => {
    try {
        const {otp} = req.body
        if(otp === req.session.userOtp){
            res.json({success:true, redirectUrl:'/reset-password'})
        }else{
            res.json({success:false, message:'OTP not matching'})
        }
    } catch (error) {
        console.error('[otp verification error in change password]', error)
        res.redirect('/pageNotFound')
    }
}

module.exports = {
    getForgotPasswordPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    newPassword,
    getProfilePage,
    profileImage,
    getChangeNamePage,
    updateProfileName,
    getChangeEmailPage,
    verifyEmail,
    verifyChangeEmailOtp,
    getResetEmailPage,
    newEmail,
    resendEmailOtp,
    getChangePasswordEmailValid,
    changePasswordValid,
    verifyChangePasswordOtp
}