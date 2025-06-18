const express = require('express')
const app = express()
const path = require('path')
const userRouter = require('./routes/userRouter')
const env = require('dotenv').config()
const db = require('./config/db')
db()

app.use(express.json())
app.use(express.urlencoded({extended:true}))

// set Ejs as view engine
app.set('view engine','ejs')
// set views directory
app.set('views',[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')])
//set public directory
app.use(express.static(path.join(__dirname,'public')))


//user route
app.use('/',userRouter)


const PORT = 7000 || process.env.PORT;
app.listen(process.env.PORT,()=>{
    console.log('Server Running');
})


module.exports = app;