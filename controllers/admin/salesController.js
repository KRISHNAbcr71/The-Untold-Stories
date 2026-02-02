const Order = require("../../models/orderSchema");
const puppeteer = require("puppeteer");

const getDateFilter = (filter, from, to) => {
  let startDate = null;
  let endDate = null;

  if (filter === "today") {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date();
  } else if (filter === "week") {
    endDate = new Date();
    startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);
  } else if (filter === "month") {
    endDate = new Date();
    startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  } else if (filter === "year") {
    endDate = new Date();
    startDate = new Date(endDate.getFullYear(), 0, 1);
  } else if (filter === "custom" && from && to) {
    startDate = new Date(from);
    endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
};

const getSalesReport = async (req, res) => {
  try {
    const { filter, from, to, page = 1, limit = 10 } = req.query;

    const { startDate, endDate } = getDateFilter(filter, from, to);

    const matchStage = {
      status: "Delivered",
    };

    if (startDate && endDate) {
      matchStage.createdAt = { $gte: startDate, $lte: endDate };
    }

    // summary cards
    const summary = await Order.aggregate([
      { $match: matchStage },

      {
        $addFields: {
          totalOfferDiscount: {
            $reduce: {
              input: "$orderItems",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.offerDiscountAmount"] },
            },
          },
        },
      },

      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          grossSales: {
            $sum: { $add: ["$subtotal", "$totalOfferDiscount"] },
          },
          offerDiscount: { $sum: "$totalOfferDiscount" },
          couponDiscount: { $sum: "$discountAmount" },
          netRevenue: { $sum: "$finalAmount" },
        },
      },
    ]);

    //graph
    const salesTrend = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          totalRevenue: { $sum: "$finalAmount" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    //table
    const skip = (page - 1) * limit;
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
      { $skip: skip },
      { $limit: Number(limit) },
    ]);

    await Order.populate(orders, {
      path: "user",
      select: "name",
    });

    const totalCount = await Order.countDocuments(matchStage);

    res.render("dashboard", {
      summary: summary[0] || {
        totalOrders: 0,
        grossSales: 0,
        offerDiscount: 0,
        couponDiscount: 0,
        netRevenue: 0,
      },
      salesTrend,
      orders,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / limit),
        totalOrders: totalCount,
      },
      filter,
      from,
      to,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales report",
    });
  }
};

//pdf

const downloadSalesReportPDF = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const browser = await puppeteer.launch({
      headless: "new",
    });

    const page = await browser.newPage();

    // GET SESSION COOKIE
    const cookies = req.headers.cookie;

    if (cookies) {
      await page.setExtraHTTPHeaders({
        cookie: cookies,
      });
    }

    // Open dashboard page
    await page.goto(
      "http://localhost:7000/admin/dashboard?filter=" +
        (req.query.filter || ""),
      { waitUntil: "networkidle0" },
    );

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=sales-report.pdf",
    });

    res.send(pdfBuffer);
  } catch (error) {
    console.error("Puppeteer PDF error:", error);
    res.status(500).send("Failed to generate PDF");
  }
};


module.exports = {
  getSalesReport,
  downloadSalesReportPDF
};
