const Coupon = require("../../models/couponSchema");
const Cart = require("../../models/cartSchema");
const Offer = require("../../models/offerSchema");

const getCoupons = async (req, res) => {
  try {
    const userId = req.session.user;
    const today = new Date();

    // Find active coupons
    const coupons = await Coupon.find({
      isDeleted: { $ne: true },
      startDate: { $lte: today },
      endDate: { $gte: today },
    });

    // Mark coupons as used if user ID exists in usedUsers array
    const couponWithUsage = coupons.map((coupon) => {
      const isUsed =
        userId &&
        coupon.usedUsers &&
        coupon.usedUsers.some(
          (usedUserId) => usedUserId.toString() === userId.toString(),
        );

      return {
        ...coupon.toObject(),
        isUsed: isUsed,
      };
    });

    res.json(couponWithUsage);
  } catch (error) {
    console.error("Error in getCoupons:", error);
    res.status(500).json({ error: "Server error" });
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

    // Check for active offers
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

    // Check if any offer is already applied to cart items
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

    // CHECK IF USER ALREADY USED THIS COUPON
    if (
      coupon.usedUsers &&
      coupon.usedUsers.some((id) => id.toString() === userId.toString())
    ) {
      return res.status(400).json({
        success: false,
        message: "You have already used this coupon",
      });
    }

    // Calculate subtotal
    let subtotal = 0;
    cart.items.forEach((item) => {
      const product = item.productId;
      const originalPrice = Number(product.price) || 0;
      const quantity = Number(item.quantity) || 1;

      // Check if product has any offer
      const productOffer = productOfferMap.get(product._id.toString()) || 0;
      const categoryId = product.category?._id || product.category;
      const categoryOffer = categoryOfferMap.get(categoryId?.toString()) || 0;
      const offerPercentage = Math.max(productOffer, categoryOffer);

      const finalPrice =
        offerPercentage > 0
          ? originalPrice - (originalPrice * offerPercentage) / 100
          : originalPrice;

      subtotal += finalPrice * quantity;
    });

    if (subtotal < coupon.minValue) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value ₹${coupon.minValue} required`,
      });
    }

    // Calculate discount
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
