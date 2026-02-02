const User = require('../models/userSchema')
const mongoose = require('mongoose')

const userAuth = async(req,res,next) =>{
    try {
        const userId = req.session.user
        if(!userId) return res.redirect('/login')

        const userData = await User.findById(userId)
        if(!userData) {
            req.session.destroy()
            return res.redirect('/login')
        }
        req.user = userData
        next()
    } catch (error) {
        console.log("Error in userAuth middleware:", error);
        res.status(500).send("Internal Server Error");
    }
}


const adminAuth = async (req, res, next) => {
  try {
    const adminId = req.session.admin;

    // 1. No session
    if (!adminId) {
      return res.redirect('/admin/login');
    }

    // 2. Invalid ObjectId (prevents CastError)
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      req.session.destroy();
      return res.redirect('/admin/login');
    }

    // 3. Fetch admin
    const admin = await User.findById(adminId);

    // 4. Validate admin
    if (!admin || !admin.isAdmin || admin.isBlocked) {
      req.session.destroy();
      return res.redirect('/admin/login');
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Error in adminAuth middleware:', error);
    res.redirect('/admin/login');
  }
};

module.exports = {userAuth, adminAuth}