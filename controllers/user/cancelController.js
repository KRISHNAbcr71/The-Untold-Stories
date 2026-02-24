const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");

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

    item.itemStatus = "Cancelled";
    item.cancellationReason = reason;

    const activeItems = order.orderItems.filter(
      (i) => i.itemStatus !== "Cancelled",
    );

    let refundAmount = item.finalPrice * item.quantity;

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

    await Product.findByIdAndUpdate(productId, {
      $inc: { quantity: item.quantity },
    });

    if (activeItems.length === 0) {
      order.status = "Cancelled";
      order.subtotal = 0;
      order.discountAmount = 0;
      order.deliveryCharge = 0;
      order.finalAmount = 0;
      order.couponCode = null;
    } else {
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

module.exports = {
  cancelSpecificProduct,
  cancelOrder,
};
