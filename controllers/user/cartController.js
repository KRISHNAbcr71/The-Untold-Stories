const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");
const Offer = require("../../models/offerSchema");


const getCartPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    if (!userData) return res.redirect("/login");

    let cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: {
        path: "category",
        model: "Category",
      },
    });

    if (!cart) {
      cart = { items: [] };
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

    activeOffers.forEach(offer => {
      if (offer.appliesTo === "product") {
        offer.targetIds.forEach(id =>
          productOfferMap.set(id.toString(), offer.discountValue)
        );
      } else {
        offer.targetIds.forEach(id =>
          categoryOfferMap.set(id.toString(), offer.discountValue)
        );
      }
    });

    // Calculate everything
    let subtotal = 0;
    let totalSavings = 0;
    let originalSubtotal = 0;
    
    // Prepare enhanced items array
    const enhancedItems = cart.items.map(item => {
      const product = item.productId;
      const originalPrice = Number(product.price) || 0;
      const quantity = Number(item.quantity) || 1;
      
      // Calculate discounts
      const productDiscount = Number(productOfferMap.get(product._id.toString())) || 0;
      const categoryDiscount = Number(categoryOfferMap.get(product.category._id.toString())) || 0;
      const offerPercentage = Math.max(productDiscount, categoryDiscount);

      // Calculate prices
      const discountAmount = offerPercentage > 0 ? originalPrice * (offerPercentage / 100) : 0;
      const finalPrice = offerPercentage > 0 ? Math.round(originalPrice - discountAmount) : originalPrice;
      const itemTotal = finalPrice * quantity;

      // Track totals
      const itemSavings = discountAmount * quantity;
      totalSavings += itemSavings;
      originalSubtotal += originalPrice * quantity;
      subtotal += itemTotal;

      // Return enhanced item
      return {
        ...item._doc,  // Use _doc for mongoose document's data
        productId: product,
        price: originalPrice,
        finalPrice: finalPrice,
        offerPercentage: offerPercentage,
        itemTotal: itemTotal,
        discountAmount: discountAmount,
        itemSavings: itemSavings
      };
    });

    // Create enhanced cart object
    const enhancedCart = {
      ...cart._doc,
      items: enhancedItems
    };

    res.render("cart", {
      cart: enhancedCart,
      subtotal: subtotal.toFixed(2),
      totalSavings: totalSavings.toFixed(2),
      originalSubtotal: originalSubtotal.toFixed(2),
      user: userData
    });

  } catch (error) {
    console.error("[Error in loading cart page]", error);
    res.redirect("/pageNotFound");
  }
};



const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;

    if (!userId) {
      return res.status(401).json({ message: "Please login to continue" });
    }

    const product = await Product.findById(productId).populate("category");
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (!product.isListed || product.isDeleted) {
      return res.status(400).json({ message: "This product is not available" });
    }

    if (
      !product.category ||
      !product.category.isListed ||
      product.category.isDeleted
    ) {
      return res
        .status(400)
        .json({ message: "This product category is not available" });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Check if product already exists in cart
    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId
    );

    // EXISTING PRODUCT → ONLY INCREASE QUANTITY
    if (itemIndex > -1) {
      if (cart.items[itemIndex].quantity + 1 > product.quantity) {
        return res
          .status(400)
          .json({ message: "Cannot add more than available stock" });
      }

      cart.items[itemIndex].quantity += 1;
      cart.items[itemIndex].totalPrice =
        cart.items[itemIndex].price * cart.items[itemIndex].quantity;
    }
    // NEW PRODUCT → CHECK TOTAL CART LIMIT
    else {
      if (cart.items.length >= 5) {
        return res.status(400).json({
          message: "You can only add up to 5 products in your cart",
        });
      }

      if (product.quantity < 1) {
        return res.status(400).json({ message: "Product out of stock" });
      }

      cart.items.push({
        productId: product._id,
        quantity: 1,
        price: product.price,
        totalPrice: product.price,
      });
    }

    await cart.save();

    await Wishlist.updateOne(
      { userId },
      { $pull: { products: { productId } } }
    );

    res.status(200).json({
      message: "Product added to cart successfully",
      cart,
    });
  } catch (error) {
    console.error("[Error in adding product to cart]", error);
    res.status(500).json({
      message: "Something went wrong while adding to cart",
    });
  }
};


const increaseQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const item = cart.items.find(
      (i) => i.productId._id.toString() === productId,
    );
    if (item) {
      if (item.quantity + 1 > item.productId.quantity) {
        return res
          .status(400)
          .json({ message: "Cannot add more than available stock" });
      }

      if (item.quantity + 1 > 5) {
        return res
          .status(400)
          .json({ message: "You can only buy up to 5 units of this product" });
      }
      item.quantity += 1;
      item.totalPrice = item.quantity * item.price;
    }

    await cart.save();
    res.json({ message: "Quantity increased", cart });
  } catch (error) {
    console.error("[Error increasing quantity]", error);
    res.redirect("/pageNotFound");
  }
};

const decreaseQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const item = cart.items.find(
      (i) => i.productId._id.toString() === productId,
    );
    if (item) {
      if (item.quantity > 1) {
        item.quantity -= 1;
        item.totalPrice = item.quantity * item.price;
      }
    }

    await cart.save();
    res.json({ message: "Quantity decreased", cart });
  } catch (error) {
    console.error("[Error decreasing quantity]", error);
    res.redirect("/pageNotFound");
  }
};

const deleteFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;

    const cart = await Cart.findOne({ userId });

    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== productId,
    );

    await cart.save();
    res.json({ message: "Product removed from the cart", cart });
  } catch (error) {
    console.error("[Error deleting product from cart]", error);
    res.redirect("/pageNotFound");
  }
};

const getCartCount = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.json({ count: 0 });

    const cart = await Cart.findOne({ userId });
    const count = cart ? cart.items.length : 0;

    res.json({ count });
  } catch (error) {
    console.error(err);
    res.json({ count: 0 });
  }
};

module.exports = {
  getCartPage,
  addToCart,
  increaseQuantity,
  decreaseQuantity,
  deleteFromCart,
  getCartCount,
};
