const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");
const Cart = require("../../models/cartSchema");
const Offer = require("../../models/offerSchema");
const Razorpay = require("razorpay");

const razorpayInstance = new Razorpay({
  key_id: process.env.KEY_ID,
  key_secret: process.env.KEY_SECRET,
});

const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const userData = await User.findById(userId);
    const today = new Date();

    //Active coupons with usage tracking
    const coupons = await Coupon.find({
      isDeleted: { $ne: true },
      startDate: { $lte: today },
      endDate: { $gte: today },
    });

    const couponsWithUsage = coupons.map((coupon) => {
      const isUsed =
        coupon.usedUsers &&
        coupon.usedUsers.some(
          (usedUserId) => usedUserId.toString() === userId.toString(),
        );
      return {
        ...coupon.toObject(),
        isUsed: isUsed,
      };
    });

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category" },
    });

    if (!cart || cart.items.length === 0) return res.redirect("/cart");

    const validItems = cart.items.filter((item) => {
      const product = item.productId;
      const category = product?.category;
      return (
        product &&
        product.isListed &&
        !product.isDeleted &&
        category &&
        category.isListed &&
        !category.isDeleted
      );
    });

    if (validItems.length !== cart.items.length) {
      cart.items = validItems;
      await cart.save();
    }

    //Stock validation
    const outOfStockItems = cart.items
      .filter(
        (item) => !item.productId || item.productId.quantity < item.quantity,
      )
      .map((item) => item.productId?.productName || "Unknown product");

    if (outOfStockItems.length > 0) {
      return res.redirect(
        `/cart?stockError=${encodeURIComponent(outOfStockItems.join(", "))}`,
      );
    }

    const addressData = await Address.findOne({ userId });

    //Active offers
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

    // Price calculations
    let subtotal = 0;
    let totalOfferSavings = 0;

    const enhancedItems = cart.items.map((item) => {
      const product = item.productId;
      const originalPrice = Number(product.price) || 0;
      const quantity = Number(item.quantity) || 1;

      const productDiscount = productOfferMap.get(product._id.toString()) || 0;
      const categoryId = product.category?._id || product.category;
      const categoryDiscount =
        categoryOfferMap.get(categoryId?.toString()) || 0;

      const offerPercentage = Math.max(productDiscount, categoryDiscount);

      const offerDiscountAmount =
        offerPercentage > 0
          ? Number(((originalPrice * offerPercentage) / 100).toFixed(2))
          : 0;

      const finalPrice = Number(
        (originalPrice - offerDiscountAmount).toFixed(2),
      );
      const itemTotal = Number((finalPrice * quantity).toFixed(2));
      const itemSavings = Number((offerDiscountAmount * quantity).toFixed(2));

      subtotal += itemTotal;
      totalOfferSavings += itemSavings;

      return {
        ...item._doc,
        productId: product,
        price: originalPrice,
        finalPrice,
        offerPercentage,
        offerDiscountAmount,
        itemTotal,
        itemSavings,
      };
    });

    const hasOfferApplied = enhancedItems.some(
      (item) => item.offerPercentage > 0,
    );

    const enhancedCart = {
      ...cart._doc,
      items: enhancedItems,
    };

    const shipping = 50;
    const total = subtotal + shipping;

    res.render("checkout", {
      user: userData,
      addressData,
      cart: enhancedCart,
      subtotal: subtotal.toFixed(2),
      shipping,
      total: total.toFixed(2),
      coupons: couponsWithUsage,
      offerSavings: totalOfferSavings.toFixed(2),
      hasOfferApplied,
    });
  } catch (error) {
    console.error("Error loading checkout page:", error);
    res.redirect("/pageNotFound");
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId, payment, couponCode } = req.body;

    if (!userId) {
      return res.json({ success: false, message: "User not logged in" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category" },
    });

    if (!cart || cart.items.length === 0) {
      return res.json({ success: false, message: "Cart is empty" });
    }

    const invalidItems = cart.items.filter((item) => {
      const product = item.productId;
      const category = product?.category;
      return (
        !product ||
        !product.isListed ||
        product.isDeleted ||
        !category ||
        !category.isListed ||
        category.isDeleted
      );
    });

    if (invalidItems.length > 0) {
      cart.items = cart.items.filter((item) => !invalidItems.includes(item));
      await cart.save();
      return res.json({
        success: false,
        message:
          "Some items in your cart are no longer available. Please review your cart.",
      });
    }

    const outOfStockItems = cart.items.filter(
      (item) => item.productId.quantity < item.quantity,
    );

    if (outOfStockItems.length > 0) {
      return res.json({
        success: false,
        message: `Some items are out of stock: ${outOfStockItems.map((i) => i.productId.productName).join(", ")}`,
      });
    }

    const now = new Date();

    // Get active offers
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
          productOfferMap.set(key, offer.discountValue);
        } else if (offer.appliesTo === "category") {
          categoryOfferMap.set(key, offer.discountValue);
        }
      });
    });

    // Calculate order items with offers
    let subtotal = 0;
    let offerSavings = 0;
    let hasOfferApplied = false;

    const orderItems = cart.items.map((cartItem) => {
      const product = cartItem.productId;
      const quantity = cartItem.quantity;
      const originalPrice = Number(product.price);

      const productDiscount = productOfferMap.get(product._id.toString()) || 0;
      const categoryDiscount = product.category?._id
        ? categoryOfferMap.get(product.category._id.toString()) || 0
        : 0;

      const offerPercentage = Math.max(productDiscount, categoryDiscount);

      if (offerPercentage > 0) {
        hasOfferApplied = true;
      }

      const discountPerItem =
        offerPercentage > 0 ? (originalPrice * offerPercentage) / 100 : 0;

      const finalPrice = Number((originalPrice - discountPerItem).toFixed(2));
      const itemSavings = Number((discountPerItem * quantity).toFixed(2));

      subtotal += finalPrice * quantity;
      offerSavings += itemSavings;

      return {
        product: product._id,
        quantity,
        price: originalPrice,
        finalPrice,
        offerPercentage,
        offerDiscountAmount: itemSavings,
        itemStatus: "Pending",
        stockDeducted: false,
      };
    });

    let discountAmount = 0;
    let couponApplied = null;
    let couponDiscountPercentage = 0;
    let couponMinValue = 0;

    if (couponCode && !hasOfferApplied) {
      const coupon = await Coupon.findOne({
        code: couponCode,
        isDeleted: { $ne: true },
        startDate: { $lte: now },
        endDate: { $gte: now },
      });

      if (!coupon) {
        return res.json({
          success: false,
          message: "Invalid or expired coupon",
        });
      }

      const alreadyUsed =
        coupon.usedUsers &&
        coupon.usedUsers.some((id) => id.toString() === userId.toString());

      if (alreadyUsed) {
        return res.json({
          success: false,
          message: "You have already used this coupon",
        });
      }

      if (subtotal < coupon.minValue) {
        return res.json({
          success: false,
          message: `Minimum order value ₹${coupon.minValue} required for this coupon`,
        });
      }

      // Apply coupon discount
      discountAmount = Number(
        ((subtotal * coupon.discountValue) / 100).toFixed(2),
      );
      couponApplied = coupon.code;
      couponDiscountPercentage = coupon.discountValue;
      couponMinValue = coupon.minValue;
    }

    const deliveryCharge = 50;
    const finalAmount = subtotal - discountAmount + deliveryCharge;

    if (payment === "wallet") {
      if ((user.wallet?.balance || 0) < finalAmount) {
        return res.json({
          success: false,
          message: "Insufficient wallet balance",
        });
      }
    }

    if (payment === "cod" && finalAmount > 1000) {
      return res.json({
        success: false,
        message: "Cash on Delivery is not allowed for orders above ₹1000",
      });
    }

    const addressDoc = await Address.findOne({
      userId,
      "address._id": addressId,
    });

    if (!addressDoc) {
      return res.json({ success: false, message: "Address not found" });
    }

    const selectedAddress = addressDoc.address.id(addressId);

    // Create order
    const order = new Order({
      user: userId,
      orderItems,
      subtotal,
      offerSavings,
      couponCode: couponApplied,
      discount: couponDiscountPercentage,
      minValue: couponMinValue,
      discountAmount,
      deliveryCharge,
      finalAmount,
      selectedAddress: {
        name: selectedAddress.name,
        landmark: selectedAddress.landmark,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode,
        fullAddress: selectedAddress.fullAddress,
        phone: selectedAddress.phone,
        altPhone: selectedAddress.altPhone || "",
      },
      status: "Pending",
      paymentMethod: payment,
      paymentStatus: payment === "wallet" ? "Paid" : "Pending",
    });

    await order.save();

    // Handle COD and Wallet payments immediately
    if (payment === "cod" || payment === "wallet") {
      for (const item of order.orderItems) {
        if (!item.stockDeducted) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { quantity: -item.quantity },
          });
          item.stockDeducted = true;
        }
      }
      await order.save();

      if (couponApplied) {
        await Coupon.findOneAndUpdate(
          { code: couponApplied },
          { $addToSet: { usedUsers: userId } },
        );
      }

      // Update wallet balance if wallet payment
      if (payment === "wallet") {
        user.wallet.balance -= finalAmount;
        user.wallet.transactions.push({
          type: "debit",
          amount: finalAmount,
          description: `Payment for order #${order.orderId}`,
          orderId: order._id,
          status: "completed",
          createdAt: new Date(),
        });
        await user.save();
      }

      // Clear cart
      await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

      return res.json({
        success: true,
        message:
          payment === "cod"
            ? "Order placed with Cash on Delivery"
            : "Order placed using wallet",
        orderId: order._id,
        orderNumber: order.orderId,
      });
    }

    // Handle Online Payment
    if (payment === "online") {
      const razorpayOrder = await razorpayInstance.orders.create({
        amount: Math.round(finalAmount * 100),
        currency: "INR",
        receipt: `receipt_${order.orderId}`,
        notes: {
          userId: userId.toString(),
          orderId: order._id.toString(),
          couponCode: couponApplied || "",
        },
      });

      order.razorpayOrderId = razorpayOrder.id;
      await order.save();

      return res.json({
        success: true,
        paymentMethod: "online",
        orderId: order._id,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.KEY_ID,
      });
    }
  } catch (error) {
    console.error("Error placing order:", error);
    return res.json({
      success: false,
      message: error.message || "Failed to place order",
    });
  }
};

module.exports = {
  getCheckoutPage,
  placeOrder,
};
