const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Offer = require("../../models/offerSchema")
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");


const getWishlistPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);

    if (!userData) return res.redirect("/login");

    let wishlist = await Wishlist.findOne({ userId }).populate(
      "products.productId",
    );

    if (!wishlist) {
      wishlist = { products: [] };
    }

    const now = new Date();
    const activeOffers = await Offer.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    const productOfferMap = new Map();
    const categoryOfferMap = new Map();

    activeOffers.forEach((offer) => {
      if (offer.appliesTo === "product") {
        offer.targetIds.forEach((id) =>
          productOfferMap.set(id.toString(), offer.discountValue),
        );
      } else {
        offer.targetIds.forEach((id) =>
          categoryOfferMap.set(id.toString(), offer.discountValue),
        );
      }
    });

    // Calculate everything
    let subtotal = 0;
    let totalSavings = 0;
    let originalSubtotal = 0;

    // Prepare enhanced items array
    const enhancedItems = wishlist.products.map((item) => {
      const product = item.productId;
      const originalPrice = Number(product.price) || 0;
      const quantity = Number(item.quantity) || 1;

      // Calculate discounts
      const productDiscount =
        Number(productOfferMap.get(product._id.toString())) || 0;
      const categoryDiscount =
        Number(categoryOfferMap.get(product.category._id.toString())) || 0;
      const offerPercentage = Math.max(productDiscount, categoryDiscount);

      // Calculate prices
      const discountAmount =
        offerPercentage > 0 ? originalPrice * (offerPercentage / 100) : 0;
      const finalPrice =
        offerPercentage > 0
          ? Math.round(originalPrice - discountAmount)
          : originalPrice;
      const itemTotal = finalPrice * quantity;

      // Track totals
      const itemSavings = discountAmount * quantity;
      totalSavings += itemSavings;
      originalSubtotal += originalPrice * quantity;
      subtotal += itemTotal;

      // Return enhanced item
      return {
        ...item._doc, // Use _doc for mongoose document's data
        productId: product,
        price: originalPrice,
        finalPrice: finalPrice,
        offerPercentage: offerPercentage,
        itemTotal: itemTotal,
        discountAmount: discountAmount,
        itemSavings: itemSavings,
      };
    });

    // Create enhanced cart object
    const enhancedWishlist = {
      ...wishlist._doc,
      products: enhancedItems,
    };

    res.render("wishlist", {
      wishlist: enhancedWishlist,
      user: userData,
      subtotal: subtotal.toFixed(2),
      totalSavings: totalSavings.toFixed(2),
      originalSubtotal: originalSubtotal.toFixed(2)
    });
  } catch (error) {
    console.error("[Error in loading wishlist page]", error);
    res.redirect("/pageNotFound");
  }
};

const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;

    if (!userId)
      return res.status(401).json({ message: "Please login to continue" });

    const product = await Product.findById(productId).populate("category");

    if (!product) return res.status(404).json({ message: "Product not found" });

    if (!product.isListed || product.isDeleted)
      return res.status(400).json({ message: "This product is not available" });

    if (
      !product.category ||
      !product.category.isListed ||
      product.category.isDeleted
    )
      return res
        .status(400)
        .json({ message: "This category is not available" });

    const cart = await Cart.findOne({ userId });
    if (cart) {
      const inCart = cart.items.some(
        (item) => item.productId.toString() === productId,
      );
      if (inCart)
        return res.status(400).json({ message: "Product already in cart" });
    }

    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) wishlist = new Wishlist({ userId, products: [] });

    let itemIndex = wishlist.products.findIndex(
      (product) => product.productId.toString() === productId,
    );

    if (itemIndex === -1) {
      wishlist.products.push({
        productId: product._id,
        price: product.price,
      });
    } else {
      return res.status(400).json({ message: "Product already in wishlist" });
    }

    await wishlist.save();

    res
      .status(200)
      .json({ message: "Product added to wishlist successfully", wishlist });
  } catch (error) {
    console.error("[Error in adding product to wishlist]", error);
    res
      .status(500)
      .json({ message: "Something went wrong while adding to wishlist" });
  }
};

const deleteFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;
    const wishlist = await Wishlist.findOne({ userId });
    if (!wishlist)
      return res.status(404).json({ message: "Wishlist not found" });
    wishlist.products = wishlist.products.filter(
      (product) => product.productId.toString() !== productId,
    );
    await wishlist.save();
    res.json({ message: "Product removed from the wishlist", wishlist });
  } catch (error) {
    console.error("[Error deleting product from wishlist]", error);
    res
      .status(500)
      .json({ message: "Something went wrong while removing from wishlist" });
  }
};

const getWishlistCount = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.json({ count: 0 });
    const wishlist = await Wishlist.findOne({ userId });
    const count = wishlist ? wishlist.products.length : 0;
    res.json({ count });
  } catch (error) {
    console.error(err);
    res.json({ count: 0 });
  }
};

module.exports = {
  getWishlistPage,
  addToWishlist,
  deleteFromWishlist,
  getWishlistCount,
};
