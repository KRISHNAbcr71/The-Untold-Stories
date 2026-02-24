const Order = require("../../models/orderSchema");

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

    let aggregationUnit = "week"; 

    if (filter === "today") {
      aggregationUnit = "day";
    } else if (filter === "month") {
      aggregationUnit = "month";
    } else if (filter === "year") {
      aggregationUnit = "month";
    } else if (filter === "custom") {
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 1) {
        aggregationUnit = "hour";
      } else if (diffDays <= 30) {
        aggregationUnit = "day";
      } else if (diffDays <= 365) {
        aggregationUnit = "week";
      } else {
        aggregationUnit = "month";
      }
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

    // DYNAMIC CHART AGGREGATION BASED ON FILTER
    let salesTrend;

    if (aggregationUnit === "hour") {
      salesTrend = await Order.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d %H:00", date: "$createdAt" },
            },
            totalRevenue: { $sum: "$finalAmount" },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      formattedSalesTrend = salesTrend.map((item) => ({
        label: new Date(item._id).toLocaleTimeString("en-US", {
          hour: "numeric",
          hour12: true,
        }),
        totalRevenue: item.totalRevenue,
      }));
    } else if (aggregationUnit === "day") {
      salesTrend = await Order.aggregate([
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

      formattedSalesTrend = salesTrend.map((item) => ({
        label: new Date(item._id).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        totalRevenue: item.totalRevenue,
      }));
    } else if (aggregationUnit === "week") {
      salesTrend = await Order.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $dateTrunc: {
                date: "$createdAt",
                unit: "week",
                startOfWeek: "Sunday",
              },
            },
            totalRevenue: { $sum: "$finalAmount" },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      formattedSalesTrend = salesTrend.map((item) => {
        const start = new Date(item._id);
        const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);

        const format = (d) =>
          d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });

        return {
          label: `${format(start)} – ${format(end)}`,
          totalRevenue: item.totalRevenue,
        };
      });
    } else if (aggregationUnit === "month") {
      salesTrend = await Order.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m", date: "$createdAt" },
            },
            totalRevenue: { $sum: "$finalAmount" },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      formattedSalesTrend = salesTrend.map((item) => ({
        label: new Date(item._id + "-01").toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        }),
        totalRevenue: item.totalRevenue,
      }));
    }

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

    res.render("sales", {
      summary: summary[0] || {
        totalOrders: 0,
        grossSales: 0,
        offerDiscount: 0,
        couponDiscount: 0,
        netRevenue: 0,
      },
      salesTrend: formattedSalesTrend || [],
      orders,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / limit),
        totalOrders: totalCount,
      },
      filter: filter,
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

module.exports = {
  getSalesReport,
};
