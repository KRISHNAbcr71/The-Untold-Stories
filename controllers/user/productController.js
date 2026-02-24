const Product = require("../../models/productSchema");
const Offer = require("../../models/offerSchema");
const User = require("../../models/userSchema");
const Wishlist = require("../../models/wishlistSchema");
const Category = require("../../models/categorySchema");
const Order = require("../../models/orderSchema");
const mongoose = require("mongoose")
const { Types } = mongoose;

// Controller to render the home page
const loadHomepage = async (req, res) => {
  try {
    const userId = req.session.user;

    let wishlistIds = [];
    if (userId) {
      const wishlist = await Wishlist.findOne({ userId });
      wishlistIds = wishlist
        ? wishlist.products.map((p) => p.productId.toString())
        : [];
    }

    const categories = await Category.find({
      isListed: true,
      isDeleted: false,
    });
    let productData = await Product.find({
      isListed: true,
      isDeleted: false,
      category: { $in: categories.map((category) => category._id) },
    })
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .limit(4);

    const bestSelling = await Order.aggregate([
      { $unwind: "$orderItems" },
      {
        $group: {
          _id: "$orderItems.product",
          totalSold: { $sum: "$orderItems.quantity" },
        },
      },
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
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $match: {
          "product.isListed": true,
          "product.isDeleted": false,
          "category.isListed": true,
          "category.isDeleted": false,
        },
      },
      { $sort: { totalSold: -1 } },
    ]);

    let bestSellingProducts = [];
    if (bestSelling.length > 0) {
      const maxSold = bestSelling[0].totalSold;
      bestSellingProducts = bestSelling.filter(
        (item) => item.totalSold === maxSold,
      );
    }

    const userData = userId ? await User.findById(userId) : null;

    res.status(200).render("home", {
      user: userData,
      products: productData,
      bestSellingProducts,
      wishlistIds,
    });
  } catch (error) {
    console.error("[Home page load error]", error);
    res
      .status(500)
      .send("An unexpected error occurred. Please try again later.");
  }
};

const loadShoppingPage = async (req, res) => {
  try {
    let page = Math.max(1, parseInt(req.query.page) || 1);
    let limit = 6;
    let skip = (page - 1) * limit;

    const search = req.query.search ? req.query.search.trim() : "";
    const category = req.query.category || "";
    const minPrice = parseFloat(req.query.minPrice);
    const maxPrice = parseFloat(req.query.maxPrice);
    const sort = req.query.sort || "";

    let userData = null;
    if (req.session.user) {
      userData = await User.findById(req.session.user);
    }

    let wishlistIds = [];
    if (req.session.user) {
      const wishlist = await Wishlist.findOne({ userId: req.session.user });
      wishlistIds = wishlist
        ? wishlist.products.map((p) => p.productId.toString())
        : [];
    }

    const match = {
      isListed: true,
      isDeleted: false,
      price: { $gt: 0 },
    };

    if (minPrice) match.price = { $gte: minPrice };
    if (maxPrice) match.price = { ...match.price, $lte: maxPrice };
    if (search) match.productName = { $regex: search, $options: "i" };
    if (category && Types.ObjectId.isValid(category)) {
      match.category = new Types.ObjectId(category);
    }

    let sortOptions = {};
    switch (sort) {
      case "priceLowHigh":
        sortOptions.price = 1;
        break;
      case "priceHighLow":
        sortOptions.price = -1;
        break;
      case "a-z":
        sortOptions.productName = 1;
        break;
      case "z-a":
        sortOptions.productName = -1;
        break;
      default:
        sortOptions.createdAt = -1;
    }

    const agg = await Product.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      { $match: { "category.isListed": true, "category.isDeleted": false } },
      { $sort: sortOptions },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                productName: 1,
                price: 1,
                quantity: 1,
                productImage: 1,
                createdAt: 1,
                category: { _id: "$category._id", name: "$category.name" },
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const products = agg[0]?.data || [];
    const totalProducts = agg[0]?.total?.[0]?.count || 0;
    const totalPages = Math.ceil(totalProducts / limit);

    const categories = await Category.find({
      isListed: true,
      isDeleted: false,
    }).lean();

    const now = new Date();
    const activeOffers = await Offer.find({
      isDeleted: false,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    const productOfferMap = new Map();
    const categoryOfferMap = new Map();

    activeOffers.forEach((offer) => {
      if (offer.appliesTo === "product") {
        offer.targetIds.forEach((id) => {
          productOfferMap.set(id.toString(), offer.discountValue);
        });
      } else if (offer.appliesTo === "category") {
        offer.targetIds.forEach((id) => {
          categoryOfferMap.set(id.toString(), offer.discountValue);
        });
      }
    });

    const productsWithOffers = products.map((product) => {
      const productDiscount = productOfferMap.get(product._id.toString()) || 0;

      const categoryDiscount =
        categoryOfferMap.get(product.category._id.toString()) || 0;

      //Pick the higher discount
      const discountValue = Math.max(productDiscount, categoryDiscount);

      return {
        ...product,
        discountValue,
      };
    });

    res.render("shop", {
      products: productsWithOffers,
      wishlistIds,
      totalPages,
      categories,
      currentPage: page,
      search,
      category,
      minPrice,
      maxPrice,
      sort,
      limit,
      totalProducts,
      user: userData,
    });
  } catch (error) {
    console.error("[Error loading shop page]", error);
    res.status(500).render("page-404");
  }
};

const loadProductDetailsPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);

    let wishlistIds = [];
    if (userId) {
      const wishlist = await Wishlist.findOne({ userId });
      wishlistIds = wishlist
        ? wishlist.products.map((p) => p.productId.toString())
        : [];
    }

    const productId = req.query.id;
    const product = await Product.findOne({
      _id: productId,
      isListed: true,
    }).populate("category");

    if (!product || product.isDeleted) {
      return res.redirect("/shop");
    }

    if (
      !product.category ||
      !product.category.isListed ||
      product.category.isDeleted
    )
      return res.redirect("/shop");

    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: productId },
    }).limit(4);

    const now = new Date();
    const activeOffers = await Offer.find({
      isDeleted: false,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    let productDiscount = 0;
    let categoryDiscount = 0;

    activeOffers.forEach((offer) => {
      // Product-level offer
      if (
        offer.appliesTo === "product" &&
        offer.targetIds.some((id) => id.toString() === product._id.toString())
      ) {
        productDiscount = Math.max(productDiscount, offer.discountValue);
      }

      // Category-level offer
      if (
        offer.appliesTo === "category" &&
        offer.targetIds.some(
          (id) => id.toString() === product.category._id.toString(),
        )
      ) {
        categoryDiscount = Math.max(categoryDiscount, offer.discountValue);
      }
    });

    const discountValue = Math.max(productDiscount, categoryDiscount);
    const offerPrice =
      discountValue > 0
        ? Math.round(product.price - (product.price * discountValue) / 100)
        : product.price;

    res.render("product-details", {
      user: userData,
      product,
      category: product.category,
      relatedProducts,
      discountValue,
      offerPrice,
      wishlistIds,
    });
  } catch (error) {
    console.error("[Error for fetching product details]", error);
    res.redirect("/pageNotFound");
  }
};

module.exports = {
  loadHomepage,
  loadShoppingPage,
  loadProductDetailsPage,
};
