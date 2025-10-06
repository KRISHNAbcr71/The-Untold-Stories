const express = require('express')
const router = express.Router()
const adminController = require('../controllers/admin/adminController')
const customerController = require('../controllers/admin/customerController')
const categoryController = require('../controllers/admin/categoryController')
const productController = require('../controllers/admin/productController')
const bannerController = require('../controllers/admin/bannerController')
const couponController = require('../controllers/admin/couponController')
const orderController = require('../controllers/admin/orderController')
const { route } = require('./userRouter')
const {upload, uploadBanner} = require('../middlewares/multer')

router.get('/pageError',adminController.loadErrorPage)


// Admin authentication
// --------------------
router.get('/login',adminController.loadLogin)
router.post('/login',adminController.login)
router.get('/dashboard',adminController.loadDashboard)
router.get('/logout',adminController.logout)


// Customer Management
// -------------------
router.get('/users',customerController.customerInfo)
router.get('/blockCustomer',customerController.customerBlocked)
router.get('/unblockCustomer',customerController.customerUnblocked)


// Category management
// -------------------
router.get('/category',categoryController.categoryInfo)
router.get('/addCategory',categoryController.loadAddCategory)
router.post('/addCategory',categoryController.addCategory)
router.get('/listCategory',categoryController.getListCategory)
router.get('/unlistCategory',categoryController.getUnlistCategory)
router.get('/editCategory',categoryController.getEditCategory)
router.put('/editCategory/:id',categoryController.editCategory)
router.delete('/deleteCategory/:id',categoryController.deleteCategory)
router.get('/trash-category',categoryController.trashCategory)
router.patch('/restore-category/:id',categoryController.restoreCategory)


// Product management
// -----------------
router.get('/product',productController.productInfo)
router.get('/addProduct',productController.loadAddProduct)
router.post('/addProduct',upload,productController.addProduct)
router.get('/listProduct',productController.getListProduct)
router.get('/unlistProduct',productController.getUnlistProduct)
router.get('/editProduct',productController.getEditProduct);
router.post("/editProduct/:id",upload,productController.editProduct);
router.delete("/deleteImage/:productId/:imageName",productController.deleteSingleImage,);
router.delete("/deleteProduct/:id",productController.deleteProduct);
router.get('/trashProduct',productController.trashProduct)
router.patch('/restoreProduct/:id',productController.restoreProduct)


// Banner management
// -----------------
router.get('/banner',bannerController.getBannerPage)
router.get('/addBanner',bannerController.getAddBannerPage)
router.post('/addBanner',uploadBanner,bannerController.addBanner)


// Coupon management
// -----------------
router.get('/coupon',couponController.getCouponPage)
router.get('/addCoupon',couponController.getAddCouponPage)
router.post('/addCoupon',couponController.addCoupon)
router.get('/editCoupon',couponController.getEditCoupon)
router.patch('/editCoupon/:id',couponController.editCoupon)
router.delete('/deleteCoupon/:id',couponController.deleteCoupon)


// Order Management
router.get('/orders',orderController.getOrderPage)
router.patch('/updateStatus/:orderId',orderController.updateStatus)
router.get('/details/:orderId',orderController.viewOrderDetails)
router.post('/acceptReturn/:orderId',orderController.acceptReturnRequest)
router.post('/rejectReturn/:orderId',orderController.rejectReturnRequest)



module.exports = router