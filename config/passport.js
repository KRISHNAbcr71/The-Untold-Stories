const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
require('dotenv').config();


passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:7000/auth/google/callback'
},

async (accessToken, refreshToken, profile, done)=>{
    try {
        let user = await User.findOne({googleId:profile.id})

        if(user){
            return done(null,user)
        }else{
            user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,
                isVerified: true,
            });
            await user.save();
            return done(null,user);
        }

    } catch (error) {
        console.error('[Google Auth Error]',error)
        return done(error,null)
    }
}
));

//serialize
//storing user details in session
passport.serializeUser((user,done)=>{
    done(null,user._id)
});

//deserialize
//fetch user from DB using id
passport.deserializeUser((id, done) => {
    User.findById(id)
        .then(user => {
            done(null, user);
        })
        .catch(err => done(err));
});


module.exports = passport;











//deserialize
//fetch user details from session
// passport.deserializeUser((id,done)=>{
//     User.findById(id)
//     .then(user=>{
//         done(null,user)
//     })
//     .catch(err=>{
//         done(err,null)
//     })
// });