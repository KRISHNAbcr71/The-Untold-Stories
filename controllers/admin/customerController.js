const User = require("../../models/userSchema");

// Load customer list with search and pagination
const customerInfo = async (req, res) => {
  try {
    let search = req.query.search || "";
    let page = parseInt(req.query.page) || 1;
    const limit = 5;

    const matchCondition = {
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    };

    const count = await User.countDocuments(matchCondition);

    const userData = await User.find(matchCondition)
      .sort({ createdOn: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    for (let u of userData) {
      const index = await User.countDocuments({
        isAdmin: false,
        createdOn: { $gt: u.createdOn },
      });
      u.globalIndex = index + 1;
    }

    const totalPages = Math.ceil(count / limit);

    res.render("customers", {
      data: userData,
      totalPages,
      currentPage: page,
      limit,
      search,
      noResults: userData.length === 0,
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).send("Internal Server Error");
  }
};

// Block a customer account
const customerBlocked = async (req, res) => {
  try {
    let id = req.query.id;
    await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: "Block failed" });
  }
};

// Unblock a customer account
const customerUnblocked = async (req, res) => {
  try {
    let id = req.query.id;
    await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: "Unblock failed" });
  }
};

module.exports = {
  customerInfo,
  customerBlocked,
  customerUnblocked,
};
