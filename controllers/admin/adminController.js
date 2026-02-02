const User = require('../../models/userSchema')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')





const loadErrorPage = async(req,res)=>{
    try {
        res.status(500).render('error-page')
    } catch (error) {
        res.status(500).send('Something went while loading the error page.')
    }
}





// Controller to load the admin login page
const loadLogin = async (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect('/admin/dashboard')
        }
        const message = req.session.message || null
        req.session.message = null
        res.render('admin-login', { message })

    } catch (error) {
        console.error('[Load login error]',error)
        res.redirect('/admin/pageError')

    }
};





// Controller to handle admin login form submission
const login = async (req,res)=>{
    try {
        const {email,password} = req.body
        const admin = await User.findOne({email, isAdmin:true})

        if(!admin){
            req.session.message = 'Invalid Email'
            return res.redirect('/admin/login')
        }

        const passwordMatch = await bcrypt.compare(password,admin.password)
        if(!passwordMatch){
            req.session.message = 'Incorrect Password'
            return res.redirect('/admin/login')
        }

        req.session.admin = admin._id
        return res.redirect('/admin/dashboard')

    } catch (error) {
        console.error('[Login error]', error)
         return res.redirect('/admin/pageError')
    }
}







// Controller to handle admin logout
const logout = async(req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){
                console.log('Error in destroying session',err);
                return res.redirect('/pageError')
            }
            res.clearCookie('connect.sid');
            res.redirect('/admin/login')
        })
        
    } catch (error) {
        console.error('[Unexpected error during logout]',error)
        res.redirect('/pageError')
    }
}





module.exports = {
    loadErrorPage,
    loadLogin,
    login,
    logout
};