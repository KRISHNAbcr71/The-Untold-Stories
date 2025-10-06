const User = require('../models/userSchema')

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

module.exports = {userAuth}