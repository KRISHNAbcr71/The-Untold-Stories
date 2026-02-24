const Order = require("../../models/orderSchema");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const getDateFilter = (filter, from, to) => {
  let startDate = null;
  let endDate = null;

  const now = new Date();

  if (filter === "today") {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
  } else if (filter === "week") {
    const day = now.getDay();
    startDate = new Date(now);
    startDate.setDate(now.getDate() - day);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
  } else if (filter === "month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);
  } else if (filter === "year") {
    startDate = new Date(now.getFullYear(), 0, 1);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(now.getFullYear(), 11, 31);
    endDate.setHours(23, 59, 59, 999);
  } else if (filter === "custom" && from && to) {
    startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
};

const downloadSalesReportPDF = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const { filter, from, to } = req.query;

    const { startDate, endDate } = getDateFilter(filter, from, to);

    const matchStage = { status: "Delivered" };

    if (startDate && endDate) {
      matchStage.createdAt = { $gte: startDate, $lte: endDate };
    }

    const orders = await Order.aggregate([
      { $match: matchStage },

      {
        $addFields: {
          offerDiscount: {
            $reduce: {
              input: "$orderItems",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.offerDiscountAmount"] },
            },
          },
        },
      },

      {
        $addFields: {
          grossAmount: {
            $add: ["$subtotal", "$offerDiscount"],
          },
        },
      },

      {
        $project: {
          orderId: 1,
          createdAt: 1,
          discountAmount: 1,
          finalAmount: 1,
          offerDiscount: 1,
          grossAmount: 1,
          user: 1,
        },
      },

      { $sort: { createdAt: -1 } },
    ]);

    await Order.populate(orders, {
      path: "user",
      select: "name",
    });

    /* ================= PDF SETUP ================= */
    const doc = new PDFDocument({ margin: 20, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sales-report.pdf",
    );

    doc.pipe(res);

    /* ================= TITLE ================= */
    doc.fontSize(16).text("Sales Report", { align: "center" });
    doc.moveDown(1.5);

    // Calculate available width
    const pageWidth = 595.28;
    const leftMargin = 20;
    const rightMargin = 20;
    const availableWidth = pageWidth - leftMargin - rightMargin;

    /* ================= TABLE CONFIGURATION ================= */
    const table = {
      headers: [
        "Order ID",
        "Date",
        "Customer",
        "Gross",
        "Offer",
        "Coupon",
        "Net",
      ],
      rows: [],
      widths: [130, 65, 130, 50, 50, 50, 50], 
      startX: leftMargin,
      startY: doc.y,
    };

    orders.forEach((order) => {
      table.rows.push([
        order.orderId,
        order.createdAt.toLocaleDateString("en-GB"),
        order.user ? order.user.name : "Deleted User",
        `₹${order.grossAmount || 0}`,
        `₹${order.offerDiscount || 0}`,
        `₹${order.discountAmount || 0}`,
        `₹${order.finalAmount || 0}`,
      ]);
    });

    /* ================= DRAW TABLE ================= */
    let currentY = table.startY;

    // Draw table headers
    doc.font("Helvetica-Bold").fontSize(9);

    let currentX = table.startX;
    table.headers.forEach((header, i) => {
      doc.text(header, currentX, currentY, {
        width: table.widths[i],
        align: i === 0 ? "left" : "right",
      });
      currentX += table.widths[i];
    });

    // Draw header underline
    currentY += 15;
    doc
      .moveTo(table.startX, currentY)
      .lineTo(table.startX + table.widths.reduce((a, b) => a + b, 0), currentY)
      .stroke();

    currentY += 10;

    doc.font("Helvetica").fontSize(8);

    table.rows.forEach((row, rowIndex) => {
      if (currentY > 750) {
        doc.addPage();
        currentY = 50;

        doc.font("Helvetica-Bold").fontSize(9);
        currentX = table.startX;
        table.headers.forEach((header, i) => {
          doc.text(header, currentX, currentY, {
            width: table.widths[i],
            align: i === 0 ? "left" : "right",
          });
          currentX += table.widths[i];
        });

        currentY += 15;
        doc
          .moveTo(table.startX, currentY)
          .lineTo(
            table.startX + table.widths.reduce((a, b) => a + b, 0),
            currentY,
          )
          .stroke();

        currentY += 10;
        doc.font("Helvetica").fontSize(8);
      }

      currentX = table.startX;

      doc.text(row[0], currentX, currentY, {
        width: table.widths[0],
        align: "left",
        lineBreak: false,
        ellipsis: false,
      });
      currentX += table.widths[0];

      doc.text(row[1], currentX, currentY, {
        width: table.widths[1],
        align: "right",
      });
      currentX += table.widths[1];

      doc.text(row[2], currentX, currentY, {
        width: table.widths[2],
        align: "right",
        lineBreak: false,
        ellipsis: false,
      });
      currentX += table.widths[2];

      // Gross
      doc.text(row[3], currentX, currentY, {
        width: table.widths[3],
        align: "right",
      });
      currentX += table.widths[3];

      // Offer
      doc.text(row[4], currentX, currentY, {
        width: table.widths[4],
        align: "right",
      });
      currentX += table.widths[4];

      // Coupon
      doc.text(row[5], currentX, currentY, {
        width: table.widths[5],
        align: "right",
      });
      currentX += table.widths[5];

      // Net
      doc.text(row[6], currentX, currentY, {
        width: table.widths[6],
        align: "right",
      });

      currentY += 18;
    });

    // Draw bottom border
    doc
      .moveTo(table.startX, currentY - 5)
      .lineTo(
        table.startX + table.widths.reduce((a, b) => a + b, 0),
        currentY - 5,
      )
      .stroke();

    /* ================= SUMMARY SECTION ================= */
    if (orders.length > 0) {
      currentY += 20;

      // Calculate totals
      const totalGross = orders.reduce(
        (sum, order) => sum + (order.grossAmount || 0),
        0,
      );
      const totalOffer = orders.reduce(
        (sum, order) => sum + (order.offerDiscount || 0),
        0,
      );
      const totalCoupon = orders.reduce(
        (sum, order) => sum + (order.discountAmount || 0),
        0,
      );
      const totalNet = orders.reduce(
        (sum, order) => sum + (order.finalAmount || 0),
        0,
      );

      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("Summary", table.startX, currentY);

      currentY += 18;
      doc.font("Helvetica").fontSize(9);

      const col1X = table.startX;
      const col2X = table.startX + 200;

      doc.text(`Total Orders: ${orders.length}`, col1X, currentY);
      doc.text(`Total Gross Amount: ₹${totalGross}`, col2X, currentY);

      currentY += 18;
      doc.text(`Total Offer Discount: ₹${totalOffer}`, col1X, currentY);
      doc.text(`Total Coupon Discount: ₹${totalCoupon}`, col2X, currentY);

      currentY += 18;
      doc.font("Helvetica-Bold");
      doc.text(`Total Net Amount: ₹${totalNet}`, col1X, currentY);
    }

    doc.end();
  } catch (error) {
    console.error("Error in generating sales report PDF:", error);
    res.status(500).send("Failed to generate PDF");
  }
};

const downloadSalesReportExcel = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const { filter, from, to } = req.query;

    const { startDate, endDate } = getDateFilter(filter, from, to);

    const matchStage = { status: "Delivered" };

    if (startDate && endDate) {
      matchStage.createdAt = { $gte: startDate, $lte: endDate };
    }

    const orders = await Order.aggregate([
      { $match: matchStage },

      {
        $addFields: {
          offerDiscount: {
            $reduce: {
              input: "$orderItems",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.offerDiscountAmount"] },
            },
          },
        },
      },

      {
        $addFields: {
          grossAmount: {
            $add: ["$subtotal", "$offerDiscount"],
          },
        },
      },

      {
        $project: {
          orderId: 1,
          createdAt: 1,
          subtotal: 1,
          discountAmount: 1,
          finalAmount: 1,
          offerDiscount: 1,
          grossAmount: 1,
          user: 1,
        },
      },

      { $sort: { createdAt: -1 } },
    ]);

    await Order.populate(orders, {
      path: "user",
      select: "name",
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    worksheet.columns = [
      { header: "Order ID", key: "orderId", width: 25 },
      { header: "Date", key: "date", width: 15 },
      { header: "Customer", key: "customer", width: 20 },
      { header: "Gross Amount", key: "gross", width: 15 },
      { header: "Offer Discount", key: "offer", width: 18 },
      { header: "Coupon Discount", key: "coupon", width: 18 },
      { header: "Net Amount", key: "net", width: 15 },
    ];

    worksheet.getRow(1).font = { bold: true };

    orders.forEach((order) => {
      worksheet.addRow({
        orderId: order.orderId,
        date: order.createdAt
          ? new Date(order.createdAt).toLocaleDateString()
          : "N/A",
        customer: order.user?.name || "Deleted User",
        gross: order.grossAmount,
        offer: order.offerDiscount,
        coupon: order.discountAmount,
        net: order.finalAmount,
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sales-report.xlsx",
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Excel download error:", error);
    res.status(500).send("Failed to generate Excel");
  }
};

module.exports = {
  downloadSalesReportPDF,
  downloadSalesReportExcel,
};
