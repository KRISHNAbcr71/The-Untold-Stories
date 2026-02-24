const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const PDFDocument = require("pdfkit");

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

    // Coupon discount 
    let discountAmount = 0;
    if (order.couponCode && subtotal >= order.minValue) {
      discountAmount = order.discountAmount;
    }

    const deliveryCharge = activeItems.length > 0 ? order.deliveryCharge : 0;

    // Final amount
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
    const discountAmount = order.discountAmount || 0;
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
    currentY = y + 20;

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
  getMyOrderPage,
  viewOrderDetails,
  getInvoicePage,
  downloadInvoice,
};
