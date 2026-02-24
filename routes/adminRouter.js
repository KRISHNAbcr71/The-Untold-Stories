const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const couponController = require("../controllers/admin/couponController");
const orderController = require("../controllers/admin/orderController");
const offerController = require("../controllers/admin/offerController");
const salesController = require("../controllers/admin/salesController");
const salesExportController = require("../controllers/admin/salesExportController")
const { route } = require("./userRouter");
const { upload } = require("../middlewares/multer");
const { adminAuth } = require("../middlewares/auth");



// Error
// ----
router.get("/pageError", adminController.loadErrorPage);



// Admin authentication
// --------------------
router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/logout", adminAuth, adminController.logout);
router.get("/dashboard",adminAuth,adminController.loadDashboard)




// Customer Management
// -------------------
router.get("/users", adminAuth, customerController.customerInfo);
router.get("/blockCustomer", adminAuth, customerController.customerBlocked);
router.get("/unblockCustomer", adminAuth, customerController.customerUnblocked);




// Category management
// -------------------
router.get("/category", adminAuth, categoryController.categoryInfo);
router.get("/addCategory", adminAuth, categoryController.loadAddCategory);
router.post("/addCategory", adminAuth, categoryController.addCategory);
router.get("/listCategory", adminAuth, categoryController.getListCategory);
router.get("/unlistCategory", adminAuth, categoryController.getUnlistCategory);
router.get("/editCategory", adminAuth, categoryController.getEditCategory);
router.put("/editCategory/:id", adminAuth, categoryController.editCategory);
router.delete("/deleteCategory/:id",adminAuth,categoryController.deleteCategory,);


// Product management
// -----------------
router.get("/product", adminAuth, productController.productInfo);
router.get("/addProduct", adminAuth, productController.loadAddProduct);
router.post("/addProduct", adminAuth, upload, productController.addProduct);
router.get("/listProduct", adminAuth, productController.getListProduct);
router.get("/unlistProduct", adminAuth, productController.getUnlistProduct);
router.get("/editProduct", adminAuth, productController.getEditProduct);
router.post("/editProduct/:id",adminAuth,upload,productController.editProduct);
router.delete("/deleteImage/:productId/:imageName",adminAuth,productController.deleteSingleImage,);
router.delete("/deleteProduct/:id", adminAuth, productController.deleteProduct);




// Offer management
router.get("/offer", adminAuth, offerController.getOfferPage);
router.get("/addOffer", adminAuth, offerController.getAddOfferPage);
router.post("/addOffer", adminAuth, offerController.addOffer);
router.get("/editOffer", adminAuth, offerController.getEditOffer);
router.patch("/editOffer/:id", adminAuth, offerController.editOffer);
router.delete("/deleteOffer/:id", adminAuth, offerController.deleteOffer);




// Coupon management
// -----------------
router.get("/coupon", adminAuth, couponController.getCouponPage);
router.get("/addCoupon", adminAuth, couponController.getAddCouponPage);
router.post("/addCoupon", adminAuth, couponController.addCoupon);
router.get("/editCoupon", adminAuth, couponController.getEditCoupon);
router.patch("/editCoupon/:id", adminAuth, couponController.editCoupon);
router.delete("/deleteCoupon/:id", adminAuth, couponController.deleteCoupon);




// Order Management
// ----------------
router.get("/orders", adminAuth, orderController.getOrderPage);
router.patch("/updateStatus/:orderId", adminAuth, orderController.updateStatus);
router.get("/details/:orderId", adminAuth, orderController.viewOrderDetails);
router.post("/acceptReturn/:orderId",adminAuth,orderController.acceptReturnRequest);
router.post("/rejectReturn/:orderId",adminAuth,orderController.rejectReturnRequest);
router.post("/acceptItemReturn/:orderId/:itemId",adminAuth,orderController.acceptItemReturn )




// Sales report
// ------------
router.get("/sales", adminAuth, salesController.getSalesReport);
router.get("/downloadSalesReportPDF",adminAuth,salesExportController.downloadSalesReportPDF);
router.get("/downloadSalesReportExcel",adminAuth,salesExportController.downloadSalesReportExcel)



module.exports = router;
