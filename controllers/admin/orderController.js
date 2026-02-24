const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");

const getOrderPage = async (req, res) => {
  try {
    const search = req.query.search || "";
    const statusFilter = req.query.status || "";
    const sortOption = req.query.sort || "date_desc";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5;
    let query = {};

    if (search) {
      const users = await User.find({
        name: { $regex: search, $options: "i" },
      }).select("_id");

      const userIds = users.map((u) => u._id);

      query = {
        $or: [
          { orderId: { $regex: search, $options: "i" } },
          { user: { $in: userIds } },
        ],
      };
    }

    if (statusFilter) {
      query.status = new RegExp(`^${statusFilter}$`, "i");
    }

    let sortQuery = {};
    switch (sortOption) {
      case "date_asc":
        sortQuery = { createdAt: 1 };
        break;
      case "date_desc":
        sortQuery = { createdAt: -1 };
        break;
      case "amount_asc":
        sortQuery = { finalAmount: 1 };
        break;
      case "amount_desc":
        sortQuery = { finalAmount: -1 };
        break;
      default:
        sortQuery = { createdAt: -1 };
    }

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find(query)
      .populate("orderItems.product", "productName price productImage")
      .populate("user", "name email")
      .limit(limit)
      .skip((page - 1) * limit)
      .sort(sortQuery)
      .lean();

    const noResults = orders.length === 0;

    let queryString = "";
    if (search) queryString += `&search=${encodeURIComponent(search)}`;
    if (statusFilter)
      queryString += `&status=${encodeURIComponent(statusFilter)}`;
    if (sortOption) queryString += `&sort=${encodeURIComponent(sortOption)}`;

    res.render("orders", {
      order: orders,
      currentPage: page,
      totalPages,
      search,
      statusFilter,
      sortOption,
      noResults,
      queryString,
    });
  } catch (error) {
    console.error("[Error in loading order page]", error);
    res.redirect("/pageError");
  }
};

const updateStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: "Status is required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const lockedStatuses = [
      "Cancelled",
      "Return Requested",
      "Return Approved",
      "Return Rejected",
      "Partially Returned",
    ];

    if (lockedStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order status cannot be changed after ${order.status}`,
      });
    }

    const validStatuses = [
      "Pending",
      "Shipped",
      "Out for Delivery",
      "Delivered",
      "Cancelled",
    ];

    let newStatus;
    if (status.toLowerCase() === "out for delivery") {
      newStatus = "Out for Delivery";
    } else {
      newStatus =
        status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    }

    if (!validStatuses.includes(newStatus)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    if (order.paymentStatus === "Failed") {
      return res.status(400).json({
        message: "Cannot change status for failed payment orders",
      });
    }

    order.status = newStatus;

    if (
      newStatus === "Cancelled" &&
      order.paymentStatus === "Paid" &&
      order.paymentMethod !== "cod"
    ) {
      order.paymentStatus = "Refunded";
    }

    if (order.paymentMethod === "cod") {
      const hasActiveItems = order.orderItems.some(
        (item) => item.itemStatus !== "Cancelled",
      );

      if (!hasActiveItems) {
        order.paymentStatus = "Failed";
      } else if (newStatus === "Delivered") {
        order.paymentStatus = "Paid";
      } else {
        order.paymentStatus = "Pending";
      }
    }

    order.orderItems.forEach((item) => {
      if (
        item.itemStatus !== "Cancelled" &&
        item.itemStatus !== "Return Requested" &&
        item.itemStatus !== "Return Approved" &&
        item.itemStatus !== "Return Rejected" &&
        item.itemStatus !== "Partially Returned"
      ) {
        item.itemStatus = newStatus;
      }
    });

    await order.save();

    res.json({ success: true, status: order.status });
  } catch (error) {
    console.error("[Error in updating status]", error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

const viewOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId)
      .populate("user", "name email")
      .populate("orderItems.product", "productName price")
      .lean();
    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json(order);
  } catch (error) {
    console.error("[Error in view order details]", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

const acceptReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (
      order.status !== "Return Requested" &&
      order.status !== "Partially Returned"
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Order must be in "Return Requested" or "Partially Returned" status',
      });
    }

    const returnItems = order.orderItems.filter(
      (item) => item.itemStatus === "Return Requested",
    );

    const refundAmount = returnItems.reduce((sum, item) => {
      return sum + item.finalPrice * item.quantity;
    }, 0);

    await User.findByIdAndUpdate(order.user._id, {
      $inc: { "wallet.balance": refundAmount },
      $push: {
        "wallet.transactions": {
          type: "refund",
          amount: refundAmount,
          description: `Refund for returned items in order ${order.orderId}`,
          orderId: order._id,
          status: "completed",
        },
      },
    });

    order.returnVerified = true;
    order.returnRequested = false;
    order.returnDate = new Date();

    for (const item of returnItems) {
      item.itemStatus = "Return Approved";

      await Product.findByIdAndUpdate(item.product, {
        $inc: { quantity: item.quantity },
      });
    }

    const itemStatuses = order.orderItems.map((item) => item.itemStatus);

    const allItemsReturned = itemStatuses.every(
      (status) => status === "Return Approved",
    );

    const hasDeliveredItems = itemStatuses.includes("Delivered");

    const hasActiveItems = itemStatuses.some((status) =>
      ["Pending", "Shipped", "Out for Delivery", "Delivered"].includes(status),
    );

    if (allItemsReturned) {
      order.status = "Return Approved";
      order.paymentStatus = "Refunded";
    } else if (hasDeliveredItems) {
      order.status = "Partially Returned";
      order.paymentStatus = "Partially Refunded";
    } else if (hasActiveItems) {
      order.status = "Partially Returned";
      order.paymentStatus = "Partially Refunded";
    } else {
      order.status = "Partially Returned";
      order.paymentStatus = "Partially Refunded";
    }

    await order.save();

    res.json({
      success: true,
      message: "Return approved successfully. Product stock has been restored.",
      data: {
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        refundAmount,
        returnDate: order.returnDate,
        itemsReturned: returnItems.length,
        totalItems: order.orderItems.length,
      },
    });
  } catch (error) {
    console.error("[Error in accepting return request]", error);
    res.status(500).json({
      success: false,
      message: "Server error while accepting return request",
      error: error.message,
    });
  }
};

const rejectReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (
      order.status !== "Return Requested" &&
      order.status !== "Partially Returned"
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Order must be in "Return Requested" or "Partially Returned" status',
      });
    }

    const rejectedItems = order.orderItems.filter(
      (item) => item.itemStatus === "Return Requested",
    );

    order.returnVerified = false;
    order.returnRequested = false;
    order.returnDate = new Date();

    rejectedItems.forEach((item) => {
      item.itemStatus = "Return Rejected";
    });

    const itemStatuses = order.orderItems.map((item) => item.itemStatus);
    const hasDeliveredItems = itemStatuses.includes("Delivered");
    const hasActiveItems = itemStatuses.some((status) =>
      ["Pending", "Shipped", "Out for Delivery", "Delivered"].includes(status),
    );

    if (hasDeliveredItems) {
      order.status = "Partially Returned";
    } else if (hasActiveItems) {
      order.status = "Partially Returned";
    } else {
      order.status = "Return Rejected";
    }

    order.paymentStatus = "Paid";

    await order.save();

    res.json({
      success: true,
      message: "Return request rejected successfully",
      data: {
        orderId: order.orderId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        rejectedItems: rejectedItems.length,
      },
    });
  } catch (error) {
    console.error("[Error rejecting return request:]", error);
    res.status(500).json({
      success: false,
      message: "Server error while rejecting return request",
      error: error.message,
    });
  }
};

const acceptItemReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.paymentMethod === "cod" && order.paymentStatus !== "Paid") {
      return res.status(400).json({
        message: "Cannot refund COD orders that weren't paid",
      });
    }

    if (
      order.paymentStatus !== "Paid" &&
      order.paymentStatus !== "Refunded" &&
      order.paymentStatus !== "Partially Refunded"
    ) {
      return res.status(400).json({
        message: "Cannot process refund for unpaid orders",
      });
    }

    const lockedReturnStatuses = [
      "Return Approved",
      "Return Rejected",
      "Cancelled",
    ];

    if (lockedReturnStatuses.includes(order.status)) {
      return res.status(400).json({
        message: `Cannot process returns for orders with status: ${order.status}`,
      });
    }

    const item = order.orderItems.id(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (item.itemStatus !== "Return Requested") {
      return res.status(400).json({
        message: `Item is not in return requested status. Current status: ${item.itemStatus}`,
      });
    }

    // Prevent double refund
    if (item.itemStatus === "Return Approved") {
      return res.status(400).json({ message: "Item already refunded" });
    }

    // Check return window
    // if (order.deliveredDate) {
    //   const returnDeadline = new Date(order.deliveredDate);
    //   returnDeadline.setDate(returnDeadline.getDate() + 7);
    //   if (new Date() > returnDeadline) {
    //     return res.status(400).json({
    //       message: "Return period has expired (7 days from delivery)",
    //     });
    //   }
    // }

    item.itemStatus = "Return Approved";
    item.itemReturnDate = new Date();

    const refundAmount = item.finalPrice * item.quantity;

    if (
      order.paymentStatus === "Paid" ||
      order.paymentStatus === "Partially Refunded"
    ) {
      await User.findByIdAndUpdate(order.user, {
        $inc: { "wallet.balance": refundAmount },
        $push: {
          "wallet.transactions": {
            type: "refund",
            amount: refundAmount,
            description: `Refund for returned item (Order ${order.orderId})`,
            orderId: order._id,
            itemId: item._id,
            status: "completed",
            date: new Date(),
          },
        },
      });
    }

    await Product.findByIdAndUpdate(item.product, {
      $inc: { quantity: item.quantity },
    });

    const itemStatuses = order.orderItems.map((i) => i.itemStatus);
    const hasPendingReturns = itemStatuses.includes("Return Requested");
    const hasDeliveredItems = itemStatuses.includes("Delivered");
    const hasActiveItems = itemStatuses.some((status) =>
      ["Pending", "Shipped", "Out for Delivery"].includes(status),
    );

    const allItemsProcessed = itemStatuses.every((status) =>
      ["Return Approved", "Return Rejected", "Cancelled"].includes(status),
    );

    const totalRefunded = order.orderItems
      .filter((i) => i.itemStatus === "Return Approved")
      .reduce((sum, i) => sum + i.finalPrice * i.quantity, 0);

    order.returnRequested = hasPendingReturns;

    if (hasPendingReturns) {
      order.status = "Return Requested";
    } else if (hasDeliveredItems || hasActiveItems) {
      order.status = "Partially Returned";
    } else if (allItemsProcessed) {
      const allReturned = itemStatuses.every(
        (status) => status === "Return Approved",
      );

      if (allReturned) {
        order.status = "Return Approved";
      } else {
        order.status = "Partially Returned";
      }
    }

    if (totalRefunded === 0) {
      order.paymentStatus = "Paid";
    } else if (totalRefunded === order.finalAmount) {
      order.paymentStatus = "Refunded";
    } else if (totalRefunded > 0) {
      order.paymentStatus = "Partially Refunded";
    }

    await order.save();

    res.json({
      success: true,
      message: "Item return approved and refunded successfully",
      data: {
        itemStatus: item.itemStatus,
        orderStatus: order.status,
        paymentStatus: order.paymentStatus,
        refundAmount,
        totalRefunded,
        orderTotal: order.finalAmount,
      },
    });
  } catch (error) {
    console.error("[Error in acceptItemReturn]:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

module.exports = {
  getOrderPage,
  updateStatus,
  viewOrderDetails,
  acceptReturnRequest,
  rejectReturnRequest,
  acceptItemReturn,
};
