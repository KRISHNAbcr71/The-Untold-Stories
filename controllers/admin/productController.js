const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const fs = require("fs");
const path = require("path");

const productInfo = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5;

    const baseCondition = { isDeleted: { $ne: true } };
    const matchCondition = {
      ...baseCondition,
      productName: { $regex: search, $options: "i" },
    };

    const [productData, count] = await Promise.all([
      Product.find(matchCondition)
        .populate("category", "name")
        .limit(limit)
        .skip((page - 1) * limit)
        .sort({ createdAt: -1 })
        .lean(),
      Product.countDocuments(matchCondition),
    ]);

    const allProducts = await Product.find(baseCondition)
      .sort({ createdAt: -1 })
      .select("_id")
      .lean();

    const serialMap = {};
    allProducts.forEach((prod, idx) => {
      serialMap[prod._id.toString()] = idx + 1;
    });

    productData.forEach((prod) => {
      prod.serialNumber = serialMap[prod._id.toString()];
    });

    const totalPages = Math.ceil(count / limit);
    const noResults = productData.length === 0;

    res.render("product", {
      data: productData,
      totalPages,
      currentPage: page,
      limit,
      search,
      noResults,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Internal Server Error");
  }
};

const loadAddProduct = async (req, res) => {
  try {
    const [categories, products] = await Promise.all([
      Category.find({ isListed: true }).lean(),
      Product.find().populate("category", "name").lean(),
    ]);

    res.render("add-product", {
      cat: categories,
      products,
      totalProducts: products.length,
    });
  } catch (error) {
    console.error("Error in loadAddProduct:", error);
    res.redirect("/pageerror");
  }
};

const addProduct = async (req, res) => {
  try {
    const { product_name, description, category, price, author, quantity } =
      req.body;

    if (
      !product_name ||
      !description ||
      !category ||
      !price ||
      !author ||
      !quantity
    ) {
      return res
        .status(400)
        .json({ message: "All required fields must be provided." });
    }

    if (isNaN(price) || price <= 0 || isNaN(quantity) || quantity <= 0) {
      return res
        .status(400)
        .json({ message: "Price and quantity must be positive numbers." });
    }

    const productExists = await Product.findOne({ productName: product_name });
    if (productExists) {
      return res.status(400).json({
        message: "Product already exists, please try with another name.",
      });
    }

    const categoryData = await Category.findOne({ name: category });
    if (!categoryData) {
      return res.status(400).json({ message: "Invalid category name." });
    }

    const images = req.files
      ? Object.values(req.files)
          .flat()
          .map((file) => file.path.replace(/\\/g, "/").replace(/^public\//, ""))
      : [];

    if (images.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one product image is required." });
    }

    const newProduct = new Product({
      productName: product_name,
      description,
      category: categoryData._id,
      price,
      author,
      createdOn: new Date(),
      quantity,
      productImage: images,
      status: "Available",
    });

    await newProduct.save();
    return res.status(201).json({ message: "Product added successfully!" });
  } catch (error) {
    console.error("Error saving product:", error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

const getListProduct = async (req, res) => {
  try {
    const id = req.query.id;
    await Product.updateOne({ _id: id }, { $set: { isListed: true } });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: "Product listing failed" });
  }
};

const getUnlistProduct = async (req, res) => {
  try {
    const id = req.query.id;
    await Product.updateOne({ _id: id }, { $set: { isListed: false } });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: "Product unlisting failed" });
  }
};

const getEditProduct = async (req, res) => {
  try {
    const id = req.query.id;

    const product = await Product.findOne({ _id: id }).populate(
      "category",
      "name",
    );

    if (!product) {
      return res.redirect("/admin/pageError");
    }
    const categories = await Category.find({});
    res.render("editProduct", {
      product: product,
      cat: categories,
    });
  } catch (error) {
    console.error("Error fetching product data:", error);
    res.redirect("/admin/pageError");
  }
};

const editProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;

    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found." });
    }

    const duplicateProduct = await Product.findOne({
      productName: data.product_name,
      _id: { $ne: id },
    });

    if (duplicateProduct) {
      return res.status(400).json({
        success: false,
        error: "Product with the same name already exists.",
      });
    }

    let updatedImages = [...existingProduct.productImage];

    ["image1", "image2", "image3"].forEach((key, index) => {
      if (req.files[key] && req.files[key].length > 0) {
        const imagePath = req.files[key][0].path
          .replace(/\\/g, "/")
          .replace(/^public\//, "");
        updatedImages[index] = imagePath;
      }
    });

    await Product.findByIdAndUpdate(
      id,
      {
        productName: data.product_name,
        description: data.description,
        category: data.category,
        price: data.price,
        author: data.author,
        quantity: data.quantity,
        productImage: updatedImages,
      },
      { new: true },
    );

    return res
      .status(200)
      .json({ success: true, message: "Product updated successfully." });
  } catch (error) {
    console.error("Error while updating product:", error);
    res.redirect("/admin/pageError");
  }
};

const deleteSingleImage = async (req, res) => {
  try {
    const { imageName, productId } = req.params;

    if (!imageName || !productId) {
      return res
        .status(400)
        .json({ error: "Missing image name or product ID" });
    }

    const decodedImageName = decodeURIComponent(imageName);

    const product = await Product.findByIdAndUpdate(
      productId,
      { $pull: { productImage: decodedImageName } },
      { new: true },
    );

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const filename = path.basename(decodedImageName);
    const imagePath = path.join(
      __dirname,
      "..",
      "..",
      "public",
      "uploads",
      "productImages",
      filename,
    );

    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    return res.status(200).json({
      success: true,
      message: "Image removed from product successfully",
    });
  } catch (error) {
    console.error("Error while deleting image:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true },
    );

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    return res
      .status(200)
      .json({ success: true, message: "Product soft deleted successfully." });
  } catch (error) {
    console.error("Error in soft delete:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

const searchOfferProducts = async (req, res) => {
  try {
    const search = req.query.search || "";
    const products = await Product.find({
      isDeleted: false,
      productName: { $regex: search, $options: "i" },
    })
      .select("_id productName")
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Error searching offer products:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to search products",
    });
  }
};

module.exports = {
  productInfo,
  loadAddProduct,
  addProduct,
  getListProduct,
  getUnlistProduct,
  getEditProduct,
  editProduct,
  deleteSingleImage,
  deleteProduct,
  deleteProduct,
  searchOfferProducts,
};
