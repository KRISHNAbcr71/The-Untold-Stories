const Order = require("../../models/orderSchema");


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
        item.itemReturnReason = reason; 
        item.itemReturnDate = today;    
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



const returnItem = async(req,res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: "Return reason is required" 
      });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    const validOrderStatuses = ["Delivered", "Partially Returned"];
    if (!validOrderStatuses.includes(order.status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot request return for orders with status: ${order.status}` 
      });
    }

    const item = order.orderItems.id(itemId);
    if (!item) {
      return res.status(404).json({ 
        success: false, 
        message: "Item not found" 
      });
    }

    const validItemStatuses = ["Delivered"];
    if (!validItemStatuses.includes(item.itemStatus)) {
      return res.status(400).json({ 
        success: false, 
        message: `Item cannot be returned. Current status: ${item.itemStatus}` 
      });
    }

    const today = new Date();
    const deliveredDate = new Date(order.deliveredDate);
    const diffTime = today - deliveredDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays > 10) {
      return res.status(400).json({
        success: false,
        message: "Return period has expired. Returns allowed only within 10 days of delivery.",
      });
    }

    const nonReturnableStatuses = ["Return Approved", "Return Rejected", "Cancelled"];
    if (nonReturnableStatuses.includes(item.itemStatus)) {
      return res.status(400).json({ 
        success: false, 
        message: `Item cannot be returned as it is already ${item.itemStatus}` 
      });
    }

    item.itemStatus = "Return Requested";
    item.itemReturnReason = reason;
    item.itemReturnDate = new Date();

    const itemStatuses = order.orderItems.map(i => i.itemStatus);
    const hasDeliveredItems = itemStatuses.includes("Delivered");
    const hasReturnRequested = itemStatuses.includes("Return Requested");
    const allItemsProcessed = itemStatuses.every(status => 
      ["Return Requested", "Return Approved", "Return Rejected", "Cancelled"].includes(status)
    );

    order.returnRequested = hasReturnRequested;
    
    if (hasReturnRequested) {
      if (hasDeliveredItems) {
        order.status = "Partially Returned"; 
      } else {
        order.status = "Return Requested";
      }
    } else if (allItemsProcessed) {
      const allReturned = itemStatuses.every(status => status === "Return Approved");
      if (allReturned) {
        order.status = "Return Approved";
      } else {
        order.status = "Partially Returned";  
      }
    }

    await order.save();

    return res.json({ 
      success: true, 
      message: "Return request submitted successfully for the item",
      data: {
        orderStatus: order.status,
        itemStatus: item.itemStatus,
        returnDate: item.itemReturnDate
      }
    });

  } catch (error) {
    console.error("[Error in returnItem]:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Something went wrong",
      error: error.message 
    });
  }
};

module.exports = {
  returnOrder,
  returnItem
};
