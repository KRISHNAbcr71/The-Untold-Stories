const User = require("../../models/userSchema");
const bcrypt = require("bcrypt");
const Order = require("../../models/orderSchema");
const { name } = require("ejs");

const loadErrorPage = async (req, res) => {
  try {
    res.status(500).render("error-page");
  } catch (error) {
    res.status(500).send("Something went while loading the error page.");
  }
};

// Controller to load the admin login page
const loadLogin = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }
    const message = req.session.message || null;
    req.session.message = null;
    res.render("admin-login", { message });
  } catch (error) {
    console.error("[Load login error]", error);
    res.redirect("/admin/pageError");
  }
};

// Controller to handle admin login form submission
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, isAdmin: true });

    if (!admin) {
      req.session.message = "Invalid Email";
      return res.redirect("/admin/login");
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
      req.session.message = "Incorrect Password";
      return res.redirect("/admin/login");
    }

    req.session.admin = admin._id;
    return res.redirect("/admin/dashboard");
  } catch (error) {
    console.error("[Login error]", error);
    return res.redirect("/admin/pageError");
  }
};

// Controller to handle admin logout
const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log("Error in destroying session", err);
        return res.redirect("/pageError");
      }
      res.clearCookie("connect.sid");
      res.redirect("/admin/login");
    });
  } catch (error) {
    console.error("[Unexpected error during logout]", error);
    res.redirect("/pageError");
  }
};

// Controller to load admin dashboard
const loadDashboard = async (req, res) => {
  try {
    const { period = "monthly" } = req.query;

    let dateFilter = {};
    const now = new Date();

    const endOfDay = new Date(now)
    endOfDay.setHours(23,59,59,999)

    if(period === 'monthly'){
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(),1)
      startOfMonth.setHours(0,0,0,0)

      dateFilter = {
        createdAt: {
          $gte:startOfMonth,
          $lte:endOfDay
        }
      }
    }else if(period === 'yearly'){
      const startOfYear = new Date(now.getFullYear(),0,1)
      startOfYear.setHours(0,0,0,0)

      dateFilter = {
        createdAt: {
          $gte:startOfYear,
          $lte:endOfDay
        }
      }
    }

    const matchStage = {
      status: "Delivered",
      ...dateFilter,
    };

    // Top 10 best-selling products
    const topProducts = await Order.aggregate([
      { $match: matchStage },
      { $unwind: "$orderItems" },
      {
        $group: {
          _id: "$orderItems.product",
          quantitySold: { $sum: "$orderItems.quantity" },
        },
      },
      { $sort: { quantitySold: -1, _id:1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          name: "$product.productName",
          quantitySold: 1,
          _id: 0,
        },
      },
      {$sort:{quantitySold:-1, name:1}}
    ]);

    // Top 10 best-selling categories
    const topCategories = await Order.aggregate([
      { $match: matchStage },
      { $unwind: "$orderItems" },
      {
        $lookup: {
          from: "products",
          localField: "orderItems.product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category",
          quantitySold: { $sum: "$orderItems.quantity" },
        },
      },
      { $sort: { quantitySold: -1,_id:1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $project: {
          name: "$category.name",
          quantitySold: 1,
          _id: 0,
        },
      },
      {$sort:{quantitySold: -1,name:1}}
    ]);


    res.render("dashboard", {
      period,
      topProducts,
      topCategories,
    });
  } catch (error) {
    console.error("Dashboard Controller Error:", error);
    res.status(500).send("Failed to load dashboard");
  }
};

module.exports = {
  loadErrorPage,
  loadLogin,
  login,
  logout,
  loadDashboard,
};
