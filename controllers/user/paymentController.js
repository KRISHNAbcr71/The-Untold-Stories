const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");
const Cart = require("../../models/cartSchema");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpayInstance = new Razorpay({
  key_id: process.env.KEY_ID,
  key_secret: process.env.KEY_SECRET,
});

const verifyPayment = async (req, res) => {
  try {
    const userId = req.session.user;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

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
      razorpayOrderId: razorpay_order_id 
    }).populate("orderItems.product");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: This order doesn't belong to you",
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
        orderId: order._id
      });
    }

    // Check stock availability
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product._id);
      if (!product || product.quantity < item.quantity) {
        order.paymentStatus = "Failed";
        order.status = "Pending";
        await order.save();

        return res.status(400).json({
          success: false,
          message: `${item.product.productName} is out of stock`,
        });
      }
    }

    // Deduct stock
    for (const item of order.orderItems) {
      await Product.findByIdAndUpdate(item.product._id, {
        $inc: { quantity: -item.quantity },
      });
      item.stockDeducted = true;
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

    order.razorpayOrderId = razorpayOrder.id;
    order.paymentStatus = "Pending";
    await order.save();

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

module.exports = {
  verifyPayment,
  orderSuccess,
  orderFailed,
  retryPayment,
};
