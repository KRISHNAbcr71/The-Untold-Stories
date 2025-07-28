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





const loadLogin = async (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect('/admin/dashboard')
        }
        res.render('admin-login', { message: null })
    } catch (error) {
        console.error('[Load login error]',error)
        res.redirect('/admin/pageError')

    }
};



const login = async (req,res)=>{
    try {
        const {email,password} = req.body
        const admin = await User.findOne({email, isAdmin:true})

        if(!admin){
            return res.render('admin-login',{message:'Invalid email or not an admin'})
        }

        const passwordMatch = await bcrypt.compare(password,admin.password)
        if(!passwordMatch){
            return res.render('admin-login',{message:'Incorrect password'})
        }

        req.session.admin = true
        return res.redirect('/admin/dashboard')
    } catch (error) {
        console.error('[Login error]', error)
         return res.redirect('/admin/pageError')
    }
}




const loadDashboard = async (req, res) => {
    try {
        if (req.session.admin) {
            res.render('dashboard')
        } else {
            return res.redirect('/admin/login')
        }
    } catch (error) {

    }
}


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
    loadDashboard,
    logout
};