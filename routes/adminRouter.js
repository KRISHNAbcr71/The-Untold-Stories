const express = require('express')
const router = express.Router()
const adminController = require('../controllers/admin/adminController')
const customerController = require('../controllers/admin/customerController')
const {userAuth} = require('../middlewares/cache')

router.get('/pageError',adminController.loadErrorPage)

// Login Management
router.get('/login',adminController.loadLogin)
router.post('/login',adminController.login)
router.get('/dashboard',adminController.loadDashboard)
router.get('/logout',adminController.logout)

// Customer Management
router.get('/users',customerController.customerInfo)
router.get('/blockCustomer',customerController.customerBlocked)
router.get('/unblockCustomer',customerController.customerUnblocked)


module.exports = router