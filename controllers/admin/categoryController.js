const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const { default: mongoose } = require("mongoose");

// Load categories with search and pagination
const categoryInfo = async (req, res) => {
  try {
    let search = req.query.search || "";
    let page = parseInt(req.query.page) || 1;
    const limit = 5;

    const baseCondition = { isDeleted: { $ne: true } };

    const matchCondition = {
      ...baseCondition,
      name: { $regex: ".*" + search + ".*", $options: "i" },
    };

    const count = await Category.countDocuments(matchCondition);

    const categoryData = await Category.find(matchCondition)
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    for (let c of categoryData) {
      const index = await Category.countDocuments({
        ...baseCondition,
        _id: { $gt: c._id },
      });
      c.serialNumber = index + 1;
    }

    const totalPages = Math.ceil(count / limit);

    res.render("category", {
      cat: categoryData,
      totalPages,
      currentPage: page,
      limit,
      search,
      noResults: categoryData.length === 0,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).send("Internal Server Error");
  }
};

// Load add category page
const loadAddCategory = async (req, res) => {
  try {
    res.render("add-category");
  } catch (error) {
    console.error("Error loading add category page:", error);
    res.status(500).send("Internal Server Error");
  }
};

// Add new category with validation and duplicate check
const addCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (
      !name ||
      name.trim() === "" ||
      !description ||
      description.trim() === ""
    ) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
    });

    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists." });
    }

    const newCategory = new Category({ name, description });
    await newCategory.save();

    return res.json({ message: "Category added successfully." });
  } catch (error) {
    console.error("Error Saving Category:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// List a category
const getListCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: "Category listing failed" });
  }
};

// Unlist a category
const getUnlistCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.status(200).json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Category unlisting failed" });
  }
};

// Load edit category page with existing category data
const getEditCategory = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.redirect("/pageError");
    }
    const category = await Category.findOne({ _id: id });

    if (!category) {
      return res.redirect("/pageError");
    }
    res.render("edit-category", { category });
  } catch (error) {
    console.error("Error in getEditCategory:", error.message);
    res.redirect("/pageError");
  }
};

// Update category details after validation
const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid category ID." });
    }

    const trimmedName = name?.trim();
    const trimmedDescription = description?.trim();

    if (!trimmedName || !trimmedDescription) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Name and description are required.",
        });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      _id: { $ne: id }, 
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with the same name already exists.",
      });
    }

    // Update the category
    const updateCategory = await Category.findByIdAndUpdate(
      id,
      {
        name: trimmedName,
        description: trimmedDescription,
      },
      { new: true, runValidators: true },
    );

    if (!updateCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Category updated successfully.",
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

// Soft delete a category
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true },
    );

    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    return res
      .status(200)
      .json({ success: true, message: "Category soft deleted successfully." });
  } catch (error) {
    console.error("Error in soft delete:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = {
  categoryInfo,
  loadAddCategory,
  addCategory,
  getListCategory,
  getUnlistCategory,
  getEditCategory,
  editCategory,
  deleteCategory,
};
