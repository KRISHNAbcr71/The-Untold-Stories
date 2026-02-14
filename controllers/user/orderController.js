const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");
const Cart = require("../../models/cartSchema");
const Offer = require("../../models/offerSchema");
const PDFDocument = require("pdfkit");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const userData = await User.findById(userId);

    const today = new Date();

    //Active coupons
    const coupons = await Coupon.find({
      isDeleted: { $ne: true },
      startDate: { $lte: today },
      endDate: { $gte: today },
    });

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) return res.redirect("/cart");

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

    //Coupon eligibility
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
      coupons,
      offerSavings: totalOfferSavings.toFixed(2),
      hasOfferApplied,
    });
  } catch (error) {
    console.error("Error loading checkout page:", error);
    res.redirect("/pageNotFound");
  }
};

const razorpayInstance = new Razorpay({
  key_id: process.env.KEY_ID,
  key_secret: process.env.KEY_SECRET,
});

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
          productOfferMap.set(key, offer.discountValue);
        } else if (offer.appliesTo === "category") {
          categoryOfferMap.set(key, offer.discountValue);
        }
      });
    });

    let subtotal = 0;
    let offerSavings = 0;

    const orderItems = cart.items.map((cartItem) => {
      const product = cartItem.productId;
      const quantity = cartItem.quantity;
      const originalPrice = Number(product.price);

      // Stock check
      if (product.quantity < quantity) {
        throw new Error(`${product.productName} is out of stock`);
      }

      const productDiscount = productOfferMap.get(product._id.toString()) || 0;

      const categoryDiscount = product.category?._id
        ? categoryOfferMap.get(product.category._id.toString()) || 0
        : 0;

      const offerPercentage = Math.max(productDiscount, categoryDiscount);

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

    const hasOfferApplied = orderItems.some((item) => item.offerPercentage > 0);

    let discountAmount = 0;
    let couponApplied = null;
    let couponDiscountPercentage = 0;
    let couponMinValue = 0;

    if (couponCode && !hasOfferApplied) {
      const coupon = await Coupon.findOne({
        code: couponCode,
        isListed: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
      });

      if (!coupon) {
        return res.json({ success: false, message: "Invalid coupon" });
      }

      const alreadyUsed = coupon.usedUsers.includes(userId);

      if (alreadyUsed) {
        return res.json({
          success: false,
          message: "You have already used this coupon",
        });
      }

      if (coupon && subtotal >= coupon.minValue) {
        discountAmount = Number(
          ((subtotal * coupon.discountValue) / 100).toFixed(2),
        );
        couponApplied = coupon.code;
        couponDiscountPercentage = coupon.discountValue;
        couponMinValue = coupon.minValue;
      }
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

    const addressDoc = await Address.findOne({
      userId,
      "address._id": addressId,
    });

    if (!addressDoc) {
      return res.json({ success: false, message: "Address not found" });
    }

    const selectedAddress = addressDoc.address.id(addressId);

    if(payment === 'cod' && finalAmount > 1000){
      return res.status(400).json({success:false, message:'Cash on Delivery is not allowed for orders above ₹1000'})
    }

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
    }

    if ((payment === "cod" || payment === "wallet") && couponApplied) {
      await Coupon.findOneAndUpdate(
        { code: couponApplied },
        { $addToSet: { usedUsers: userId } },
      );
    }

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

    await Cart.findOneAndUpdate({ userId }, { $set: { items: [] } });

    if (payment === "online") {
      const razorpayOrder = await razorpayInstance.orders.create({
        amount: Math.round(finalAmount * 100), // paise
        currency: "INR",
        receipt: `receipt_${order.orderId}`,
        notes: {
          userId: userId.toString(),
          orderId: order._id.toString(),
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

    return res.json({
      success: true,
      message:
        payment === "cod"
          ? "Order placed with Cash on Delivery"
          : payment === "wallet"
            ? "Order placed using wallet"
            : "Order created",
      orderId: order._id,
      orderNumber: order.orderId,
    });
  } catch (error) {
    console.error("Error placing order:", error);
    return res.json({
      success: false,
      message: error.message || "Failed to place order",
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const userId = req.session.user;

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Incomplete payment data",
      });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.KEY_SECRET)
      .update(body)
      .digest("hex");

    const order = await Order.findOne({
      user: userId,
      razorpayOrderId: razorpay_order_id,
    }).populate("orderItems.product");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (expectedSignature !== razorpay_signature) {
      order.paymentStatus = "Failed";
      order.status = "Pending";
      await order.save();

      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    if (order.paymentStatus === "Paid") {
      return res.json({
        success: true,
        message: "Payment already verified",
      });
    }

    for (const item of order.orderItems) {
      if (item.product.quantity < item.quantity) {
        order.paymentStatus = "Failed";
        order.status = "Pending";
        await order.save();

        return res.status(400).json({
          success: false,
          message: `${item.product.productName} is out of stock`,
        });
      }
    }

    for (const item of order.orderItems) {
      await Product.findByIdAndUpdate(item.product._id, {
        $inc: { quantity: -item.quantity },
      });
    }

    order.paymentStatus = "Paid";
    order.paymentMethod = "online";
    order.status = "Pending";
    order.razorpayPaymentId = razorpay_payment_id;
    order.invoiceDate = new Date();

    await order.save();

    if (order.couponCode) {
      await Coupon.findOneAndUpdate(
        { code: order.couponCode },
        { $addToSet: { usedUsers: order.user } },
      );
    }

    await Cart.updateOne({ userId: order.user }, { $set: { items: [] } });

    return res.json({
      success: true,
      message: "Payment verified successfully",
      orderId: order._id,
    });
  } catch (error) {
    console.error("[verifyPayment error]:", error);
    res.status(500).json({
      success: false,
      message: "Server error during payment verification",
    });
  }
};

const orderSuccess = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    const userData = await User.findById(userId);

    res.render("order-success", {
      user: userData,
    });
  } catch (error) {
    console.error("Error loading order success page:", error);
    res.status(500).send("Something went wrong!");
  }
};

const orderFailed = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const userData = await User.findById(userId);
    const { orderId } = req.params;

    const order =
      (await Order.findOne({ _id: orderId, user: userId })) ||
      (await Order.findOne({ orderId, user: userId }));

    if (!order) return res.redirect("/my-order");

    if (order.paymentStatus !== "Failed") {
      order.paymentStatus = "Failed";
      order.status = "Pending";
      await order.save();
    }

    res.render("order-failed", {
      user: userData,
      order,
      orderId: order._id,
      razorpayKeyId: process.env.KEY_ID,
    });
  } catch (error) {
    console.error("Error in orderFailed:", error);
    res.status(500).send("Something went wrong!");
  }
};


const retryPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const order = await Order.findOne({
      orderId: orderId,
      user: userId,
    }).populate("orderItems.product");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.paymentStatus !== "Failed") {
      return res.status(400).json({
        success: false,
        message: `Retry allowed only for failed payments. Current status: ${order.paymentStatus}`,
      });
    }

    for (const item of order.orderItems) {
      const product = await Product.findById(item.product._id);

      if (product.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `${product.productName} is out of stock. Available: ${product.quantity}, Required: ${item.quantity}`,
        });
      }
    }

    const razorpayOrder = await razorpayInstance.orders.create({
      amount: order.finalAmount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    });

    //console.log('Razorpay order created:', razorpayOrder.id);

    order.razorpayOrderId = razorpayOrder.id;
    order.paymentStatus = "Pending";
    await order.save();

    //console.log('Order updated successfully');

    res.json({
      success: true,
      razorpayOrder: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt,
      },
      order: {
        _id: order._id,
        orderId: order.orderId,
        finalAmount: order.finalAmount,
      },
    });
  } catch (error) {
    console.error("Retry payment error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Server error during retry payment",
    });
  }
};

const getMyOrderPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const userData = await User.findById(userId);

    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 1;
    const skip = (page - 1) * limit;

    let query = { user: userId };
    if (search) query.orderId = { $regex: search, $options: "i" };
    const totalOrders = await Order.countDocuments(query);

    const orders = await Order.find(query)
      .populate("orderItems.product", "productName price productImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const formattedOrder = orders.map((order) => {
      // Total offer savings across all items
      const offerAppliedAmount = order.orderItems.reduce(
        (sum, item) => sum + (item.offerDiscountAmount || 0),
        0,
      );

      const items = (order.orderItems || []).map((item) => {
        const product = item.product || {};
        const productImage = product.productImage || [];
        return {
          productId: product._id?.toString() || "",
          productName: product.productName || "Product Name Unavailable",
          quantity: item.quantity || 0,
          price: item.price || 0, // Original price
          finalPrice: item.finalPrice || item.price || 0, // Price after offer
          offerDiscountAmount: item.offerDiscountAmount || 0,
          image:
            Array.isArray(productImage) && productImage.length > 0
              ? productImage[0]
              : "/images/default-product.png",
          itemStatus: item.itemStatus || "Pending",
          cancellationReason: item.cancellationReason || null,
        };
      });

      return {
        orderId: order.orderId || "N/A",
        status: order.status || "Pending",
        paymentMethod: order.paymentMethod || "cod",
        paymentStatus: order.paymentStatus || "Pending",
        finalAmount: order.finalAmount || 0,
        discountAmount: order.discountAmount || 0,
        deliveryCharge: order.deliveryCharge || 0,
        offerAppliedAmount,
        couponCode: order.couponCode || null,
        invoiceDate: order.invoiceDate || order.createdAt || new Date(),
        items,
      };
    });

    res.render("my-order", {
      user: userData,
      orders: formattedOrder,
      search,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      razorpayKeyId: process.env.KEY_ID,
    });
  } catch (error) {
    console.error("[Error in loading my order page]", error);
    res.redirect("/pageError");
  }
};

const cancelSpecificProduct = async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ orderId }).populate(
      "orderItems.product",
    );

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel product when order status is "${order.status}"`,
      });
    }

    const item = order.orderItems.find(
      (i) => i.product._id.toString() === productId,
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Product not found in order",
      });
    }

    if (["Cancelled", "Delivered"].includes(item.itemStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a ${item.itemStatus.toLowerCase()} product`,
      });
    }

    // Mark item cancelled
    item.itemStatus = "Cancelled";
    item.cancellationReason = reason;

    // Active items after cancellation
    const activeItems = order.orderItems.filter(
      (i) => i.itemStatus !== "Cancelled",
    );

    // Refund calculation (offer-applied price)
    let refundAmount = item.finalPrice * item.quantity;

    // Refund delivery charge ONLY if this was the last product
    if (activeItems.length === 0) {
      refundAmount += order.deliveryCharge || 0;
    }

    //Wallet refund
    await User.findByIdAndUpdate(order.user, {
      $inc: { "wallet.balance": refundAmount },
      $push: {
        "wallet.transactions": {
          type: "refund",
          amount: refundAmount,
          description: `Refund for cancelled item (${order.orderId})`,
          orderId: order._id,
          status: "completed",
          createdAt: new Date(),
        },
      },
    });

    // Restore product stock
    await Product.findByIdAndUpdate(productId, {
      $inc: { quantity: item.quantity },
    });

    // Recalculate order totals
    if (activeItems.length === 0) {
      // All items cancelled
      order.status = "Cancelled";
      order.subtotal = 0;
      order.discountAmount = 0;
      order.deliveryCharge = 0;
      order.finalAmount = 0;
      order.couponCode = null;
    } else {
      // Partial cancellation
      const newSubtotal = activeItems.reduce(
        (sum, i) => sum + i.finalPrice * i.quantity,
        0,
      );

      order.subtotal = newSubtotal;
      order.finalAmount =
        newSubtotal - (order.discountAmount || 0) + order.deliveryCharge;
    }

    await order.save();

    return res.json({
      success: true,
      message:
        activeItems.length === 0
          ? "Order cancelled and full amount refunded"
          : "Product cancelled successfully",
      refundAmount,
      finalAmount: order.finalAmount,
    });
  } catch (error) {
    console.error("Error cancelling product:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while cancelling product",
    });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ orderId }).populate(
      "orderItems.product",
    );
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    if (["Cancelled", "Shipped", "Delivered"].includes(order.status))
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a ${order.status.toLowerCase()} product`,
      });

    // 3. Check 24-hour cancellation window
    // const orderDate = new Date(order.invoiceDate);
    // const now = new Date();
    // const diffHours = (now - orderDate) / (1000 * 60 * 60);

    // if (diffHours > 24) {
    //     return res.status(400).json({
    //         success: false,
    //         message: 'Cannot cancel order. Cancellation period of 24 hours has expired.'
    //     });
    // }
    if (order.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel an order with status "${order.status}".`,
      });
    }

    order.orderCancellationReason = reason || "Order cancelled";
    order.orderItems.forEach((item) => (item.itemStatus = "Cancelled"));

    order.status = "Cancelled";
    order.couponCode = null;

    const refundAmount = order.finalAmount;
    await User.findByIdAndUpdate(order.user, {
      $inc: { "wallet.balance": refundAmount },
      $push: {
        "wallet.transactions": {
          type: "refund",
          amount: refundAmount,
          description: `Order cancelled refund (${order.orderId})`,
          orderId: order._id,
          status: "completed",
        },
      },
    });

    if (order.paymentMethod === "cod") {
      order.paymentStatus = "Cancelled";
    } else {
      order.paymentStatus = "Refunded";
    }

    await order.save();

    for (const item of order.orderItems) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { quantity: item.quantity },
      });
    }

    res.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("[Error cancelling order]", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const viewOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const userData = await User.findById(userId);

    const order = await Order.findOne({ orderId }).populate(
      "orderItems.product",
      "productName productImage",
    );

    if (!order) {
      return res.status(404).render("pageNotFound");
    }

    //Active (non-cancelled) items only
    const activeItems = order.orderItems.filter(
      (item) => item.itemStatus !== "Cancelled",
    );

    // ORIGINAL subtotal (before offer)
    const subtotal = activeItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    // Offer discount calculation
    const offerDiscountAmount = activeItems.reduce((sum, item) => {
      const originalTotal = item.price * item.quantity;
      const finalTotal = item.finalPrice * item.quantity;
      return sum + (originalTotal - finalTotal);
    }, 0);

    // Coupon discount (already stored correctly)
    let discountAmount = 0;
    if (order.couponCode && subtotal >= order.minValue) {
      discountAmount = order.discountAmount;
    }

    // Delivery charge only if items exist
    const deliveryCharge = activeItems.length > 0 ? order.deliveryCharge : 0;

    // Final amount (source of truth)
    const finalAmount =
      subtotal - offerDiscountAmount - discountAmount + deliveryCharge;

    return res.render("view-order", {
      user: userData,
      order,
      activeItems,
      subtotal,
      offerDiscountAmount,
      discountAmount,
      deliveryCharge,
      finalAmount,
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).render("pageError");
  }
};

const returnOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res
        .status(400)
        .json({ success: false, message: "Return reason is required" });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.status.toLowerCase().trim() !== "delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders can be returned",
      });
    }

    const today = new Date();
    const deliveredDate = new Date(order.deliveredDate);
    const diffTime = today - deliveredDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays > 10) {
      return res.status(400).json({
        success: false,
        message:
          "Return period has expired. Returns allowed only within 10 days of delivery.",
      });
    }

    order.returnReason = reason;
    order.returnDate = today;
    order.returnRequested = true;
    order.status = "Return Requested";

    order.orderItems.forEach((item) => {
      if (item.itemStatus === "Delivered") {
        item.itemStatus = "Return Requested";
      }
    });

    await order.save();

    return res.json({ success: true, message: "Order returned successfully" });
  } catch (error) {
    console.error("[Error in return order]", error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

const getInvoicePage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const userData = await User.findById(userId);

    const order = await Order.findOne({ orderId }).populate(
      "orderItems.product",
      "productName productImage",
    );

    if (!order) {
      return res.status(404).render("pageNotFound");
    }

    //Only non-cancelled items
    const activeItems = order.orderItems.filter(
      (item) => item.itemStatus !== "Cancelled",
    );

    //Original subtotal (before offer)
    const originalSubtotal = activeItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    //Subtotal after offer
    const subtotalAfterOffer = activeItems.reduce(
      (sum, item) => sum + item.finalPrice * item.quantity,
      0,
    );

    //Total offer discount
    const offerDiscountAmount = originalSubtotal - subtotalAfterOffer;

    //Coupon discount (already stored correctly)
    const discountAmount = order.discountAmount || 0;

    //Delivery charge
    const deliveryCharge = activeItems.length > 0 ? order.deliveryCharge : 0;

    //Final amount
    const finalAmount = order.finalAmount;

    res.render("invoice", {
      user: userData,
      order,
      activeItems,
      originalSubtotal,
      subtotal: subtotalAfterOffer,
      offerDiscountAmount,
      discountAmount,
      deliveryCharge,
      finalAmount,
    });
  } catch (error) {
    console.error("Error loading invoice page:", error);
    res.status(500).render("pageError");
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const order = await Order.findOne({ orderId }).populate(
      "orderItems.product",
      "productName productImage",
    );

    if (!order) return res.status(404).send("Order not found");

    const activeItems = order.orderItems.filter(
      (item) => item.itemStatus !== "Cancelled",
    );

    const originalSubtotal = activeItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const subtotalAfterOffer = activeItems.reduce(
      (sum, item) => sum + item.finalPrice * item.quantity,
      0,
    );

    const offerDiscountAmount = originalSubtotal - subtotalAfterOffer;
    const discountAmount = order.discountAmount || 0;
    const deliveryCharge = activeItems.length > 0 ? order.deliveryCharge : 0;
    const finalAmount = order.finalAmount;

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${orderId}.pdf`,
    );

    doc.pipe(res);

    doc.fillColor("#d4a373").fontSize(22).text("Invoice", { align: "center" });

    const pageMargin = 50;
    const pageWidth = doc.page.width - pageMargin * 2;

    doc
      .moveTo(pageMargin, doc.y + 5)
      .lineTo(pageMargin + pageWidth, doc.y + 5)
      .strokeColor("#d4a373")
      .lineWidth(1)
      .stroke();

    doc.moveDown(2).fillColor("black").fontSize(12);

    doc.text(`Invoice No: INV${order._id.toString().slice(-6)}`);
    doc.text(`Order ID: ${order.orderId}`);
    doc.text(`Customer Name: ${order.selectedAddress.name}`);
    doc.text("Address:");
    doc.text(order.selectedAddress.fullAddress);
    if (order.selectedAddress.landmark)
      doc.text(order.selectedAddress.landmark);
    doc.text(
      `${order.selectedAddress.state} - ${order.selectedAddress.pincode}`,
    );
    doc.text(`Phone: ${order.selectedAddress.phone}`);
    if (order.selectedAddress.altPhone) {
      doc.text(`Alt Phone: ${order.selectedAddress.altPhone}`);
    }

    doc.text(
      `Date: ${order.invoiceDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`,
    );

    const tableTop = doc.y + 20;

    doc.rect(50, tableTop, 500, 20).fill("#d4a373");
    doc.fillColor("white").font("Helvetica-Bold").fontSize(12);

    doc.text("Product", 60, tableTop + 5);
    doc.text("Qty", 220, tableTop + 5);
    doc.text("Price", 270, tableTop + 5);
    doc.text("Total", 340, tableTop + 5);
    doc.text("Status", 410, tableTop + 5);

    doc.fillColor("black").font("Helvetica").fontSize(11);

    let y = tableTop + 25;
    const colX = [50, 220, 270, 340, 410, 550];

    order.orderItems.forEach((item) => {
      doc.rect(50, y - 5, 500, 25).stroke();

      colX.forEach((x) => {
        doc
          .moveTo(x, y - 5)
          .lineTo(x, y + 20)
          .stroke();
      });

      doc.text(item.product.productName, 60, y);
      doc.text(item.quantity.toString(), 225, y);

      // ORIGINAL + OFFER PRICE
      if (item.finalPrice < item.price) {
        doc.fontSize(9).fillColor("gray").text(`${item.price}`, 275, y);
        doc
          .fontSize(11)
          .fillColor("black")
          .text(`${item.finalPrice}`, 275, y + 10);
      } else {
        doc.fontSize(11).fillColor("black").text(`${item.price}`, 275, y);
      }

      const itemTotal =
        item.itemStatus === "Cancelled" ? 0 : item.finalPrice * item.quantity;

      doc.text(`${itemTotal}`, 345, y);
      doc.text(item.itemStatus, 415, y);

      y += 25;
    });

    let paymentX = 50;
    let totalsX = 350;
    let currentY = y + 20;

    // LEFT COLUMN - PAYMENT INFO
    doc.font("Helvetica-Bold").text("Payment Method:", paymentX, currentY);
    doc
      .font("Helvetica")
      .text(order.paymentMethod.toUpperCase(), paymentX + 120, currentY);

    currentY += 18;
    doc.font("Helvetica-Bold").text("Payment Status:", paymentX, currentY);
    doc.font("Helvetica").text(order.paymentStatus, paymentX + 120, currentY);

    // RIGHT COLUMN - TOTALS
    currentY = y + 20; // reset Y for right column to align with left

    const lineGap = 18;

    doc
      .font("Helvetica-Bold")
      .text(`Subtotal: ${subtotalAfterOffer}`, totalsX, currentY, {
        align: "right",
      });
    currentY += lineGap;

    doc.text(`Coupon Discount: -${discountAmount}`, totalsX, currentY, {
      align: "right",
    });
    currentY += lineGap;

    doc.text(`Delivery: ${deliveryCharge}`, totalsX, currentY, {
      align: "right",
    });
    currentY += lineGap + 5;

    doc.text(`Final Amount: ${finalAmount}`, totalsX, currentY, {
      align: "right",
    });

    doc.moveDown(4);

    doc
      .moveTo(pageMargin, doc.y)
      .lineTo(pageMargin + pageWidth, doc.y)
      .strokeColor("#d4a373")
      .lineWidth(1)
      .stroke();

    doc.moveDown(2);

    doc
      .fontSize(12)
      .fillColor("#555")
      .text("Thank you for your purchase!", pageMargin, doc.y, {
        width: pageWidth,
        align: "center",
      });

    doc.end();
  } catch (error) {
    console.error("Error generating invoice PDF:", error);
    res.status(500).send("Server error");
  }
};

module.exports = {
  getCheckoutPage,
  placeOrder,
  verifyPayment,
  orderSuccess,
  orderFailed,
  // paymentFailed,
  retryPayment,
  getMyOrderPage,
  cancelSpecificProduct,
  cancelOrder,
  viewOrderDetails,
  returnOrder,
  getInvoicePage,
  downloadInvoice,
};
