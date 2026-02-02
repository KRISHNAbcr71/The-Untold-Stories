const Coupon = require("../../models/couponSchema");
const Cart = require("../../models/cartSchema");
const Offer = require("../../models/offerSchema");

const getCoupons = async (req, res) => {
  try {
    const today = new Date();
    const coupons = await Coupon.find({
      isDeleted: { $ne: true },
      startDate: { $lte: today },
      endDate: { $gte: today },
    });

    res.json(coupons);
  } catch (error) {
    console.error(error);
    res.redirect("/pageError");
  }
};

const applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { couponCode } = req.body;
    const today = new Date();

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const now = new Date();
    const activeOffers = await Offer.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    const productOfferMap = new Map();
    const categoryOfferMap = new Map();

    activeOffers.forEach((offer) => {
      offer.targetIds.forEach((id) => {
        const key = id.toString();
        if (offer.appliesTo === "product") {
          productOfferMap.set(
            key,
            Math.max(productOfferMap.get(key) || 0, offer.discountValue),
          );
        }
        if (offer.appliesTo === "category") {
          categoryOfferMap.set(
            key,
            Math.max(categoryOfferMap.get(key) || 0, offer.discountValue),
          );
        }
      });
    });

    const hasOfferApplied = cart.items.some((item) => {
      const product = item.productId;

      const productOffer = productOfferMap.get(product._id.toString()) || 0;

      const categoryId = product.category?._id || product.category;
      const categoryOffer = categoryOfferMap.get(categoryId?.toString()) || 0;

      return Math.max(productOffer, categoryOffer) > 0;
    });

    if (hasOfferApplied) {
      return res.status(400).json({
        success: false,
        message:
          "Coupon cannot be applied when product/category offers are active",
      });
    }

    const coupon = await Coupon.findOne({
      code: couponCode,
      isDeleted: { $ne: true },
      startDate: { $lte: today },
      endDate: { $gte: today },
    });

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired coupon",
      });
    }

    //calculate subtotal
    let subtotal = 0;

    cart.items.forEach((item) => {
      subtotal += item.productId.price * item.quantity;
    });

    if (subtotal < coupon.minValue) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value ₹${coupon.minValue} required`,
      });
    }

    const discountAmount = Math.floor((subtotal * coupon.discountValue) / 100);

    const shipping = 50;
    const total = subtotal - discountAmount + shipping;

    res.json({
      success: true,
      couponCode,
      discountAmount,
      shipping,
      total,
    });
  } catch (error) {
    console.error("[Error applying coupon]", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const { subtotal } = req.body;
    const discountAmount = 0;
    const shipping = 50;
    const total = parseFloat(subtotal) + shipping;

    res.json({
      success: true,
      couponCode: null,
      discountAmount,
      shipping,
      total,
    });
  } catch (error) {
    console.error("[Error in removing coupon]", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

module.exports = {
  getCoupons,
  applyCoupon,
  removeCoupon,
};
