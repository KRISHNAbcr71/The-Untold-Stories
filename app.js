const express = require('express');
const app = express();
const path = require('path');
const nocache = require('nocache')
const session = require('express-session');
const passport = require('./config/passport')
const userRouter = require('./routes/userRouter');
const env = require('dotenv').config();
const db = require('./config/db');
db();

app.use(express.urlencoded({extended:true}));
app.use(express.json());

app.use(session({
    name: 'connect.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 72*60*60*1000,
        sameSite: 'Strict'
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(nocache())
app.use((req,res,next)=>{
    res.set('Cache-Control','no-store')
    next();
});

app.set('view engine','ejs'); // set Ejs as view engine
app.set('views',[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')]);   // set views directory
app.use(express.static(path.join(__dirname,'public')));   //set public directory

//user route
app.use('/',userRouter);

const PORT = process.env.PORT  || 7000;
app.listen(PORT,()=>{
    console.log('Server Running');
});

module.exports = app;