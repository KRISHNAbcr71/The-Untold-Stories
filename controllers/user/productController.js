const Product = require("../../models/productSchema");
const Offer = require("../../models/offerSchema");
const User = require("../../models/userSchema");
const Wishlist = require("../../models/wishlistSchema")

const loadProductDetailsPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);

    let wishlistIds = [];
        if(userId){
          const wishlist = await Wishlist.findOne({userId})
          wishlistIds = wishlist ? wishlist.products.map(p => p.productId.toString()) : []
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
      wishlistIds
    });
  } catch (error) {
    console.error("[Error for fetching product details]", error);
    res.redirect("/pageNotFound");
  }
};

module.exports = {
  loadProductDetailsPage,
};
