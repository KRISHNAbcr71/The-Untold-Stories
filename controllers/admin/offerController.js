const Offer = require("../../models/offerSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

// Load offer list with search, pagination, and active status
const getOfferPage = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5;

    const query = {
      isDeleted: false,
      $or: [{ name: { $regex: search, $options: "i" } }],
    };

    const offers = await Offer.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const now = new Date()
    const updateOffers = offers.map(offer =>{
      return {
        ...offer.toObject(),
        isActive: now >= offer.startDate && now <= offer.endDate
      }
    });

    const totalOffers = await Offer.countDocuments(query);
    const totalPages = Math.ceil(totalOffers / limit);

    const noResults = offers.length === 0;
    res.render("offer", {
      offers:updateOffers,
      currentPage: page,
      totalPages,
      search,
      noResults,
    });
  } catch (error) {
    console.error("[Error in loading offer page]", error);
    res.redirect("/pageError");
  }
};

// Load add offer page with products and categories
const getAddOfferPage = async (req, res) => {
  try {
    const products = await Product.find({ isDeleted: false, isListed: true });
    const categories = await Category.find({
      isDeleted: false,
      isListed: true,
    });
    res.render("add-offer", { products, categories });
  } catch (error) {
    console.error("[Error loading Add Offer Page]", error);
    res.redirect("/pageError");
  }
};

// Add a new offer with validation and active status
const addOffer = async (req, res) => {
  try {
    const { name, discountValue, appliesTo, targetIds, startDate, endDate } =
      req.body;

    if (!name || !discountValue || !startDate || !endDate || !appliesTo) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be filled",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);


    if (start.toDateString() === end.toDateString()) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date cannot be the same"
      });
    }

    if (start > end) {
      return res
        .status(400)
        .json({ success: false, message: "End date must be after start date" });
    }

    if (!Array.isArray(targetIds) || targetIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one product or category",
      });
    }

    const existingOffer = await Offer.findOne({
      name: name.trim().toUpperCase(),
      isDeleted: false,
    });

    if (existingOffer) {
      return res
        .status(409)
        .json({ success: false, message: "Offer already exists" });
    }

    const now = new Date();
    const isActive = now >= start && now <= end;

    const newOffer = new Offer({
      name: name.trim().toUpperCase(),
      discountValue: Number(discountValue),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      appliesTo,
      targetIds: Array.isArray(targetIds) ? targetIds : [targetIds],
      isActive: isActive,
    });

    await newOffer.save();

    return res
      .status(201)
      .json({ success: true, message: "Offer added successfully" });
  } catch (error) {
    console.error("[Error in adding offer]", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Load edit offer page with offer, products, and categories
const getEditOffer = async (req, res) => {
  try {
    const offerId = req.query.id;
    if (!offerId) {
      return res.redirect("/admin/offer");
    }

    const offer = await Offer.findOne({
      _id: offerId,
      isDeleted: false,
    });

    if (!offer) {
      return res.redirect("/admin/offer");
    }

    const products = await Product.find({
      isDeleted: false,
      isListed: true,
    });

    const categories = await Category.find({
      isDeleted: false,
      isListed: true,
    });

    res.render("edit-offer", {
      offer,
      products,
      categories,
    });
  } catch (error) {
    console.error("[Error in loading edit offer page]", error);
    res.redirect("/pageError");
  }
};

// Update offer details with validation
const editOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, discountValue, startDate, endDate } = req.body;

    if (!name || !discountValue || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date",
      });
    }

    const offer = await Offer.findById(id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (name.trim().toUpperCase() !== offer.name) {
      const existingOffer = await Offer.findOne({
        name: name.trim().toUpperCase(),
        _id: { $ne: id },
        isDeleted: false,
      });

      if (existingOffer) {
        return res.status(409).json({
          success: false,
          message: "Offer name already exists",
        });
      }
    }

    // Update the offer
    offer.name = name.trim().toUpperCase();
    offer.discountValue = Number(discountValue);
    offer.startDate = new Date(startDate);
    offer.endDate = new Date(endDate);

    await offer.save();

    return res.status(200).json({
      success: true,
      message: "Offer updated successfully",
    });
  } catch (error) {
    console.error("[Error in updating offer]", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Soft delete offer
const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Offer ID is required",
      });
    }

    const offer = await Offer.findByIdAndUpdate(
      id,
      {
        isDeleted: true,
        updatedAt: Date.now(),
      },
      { new: true },
    );

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Offer deleted successfully",
    });
  } catch (error) {
    console.error("[Error in deleting offer]", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  getOfferPage,
  getAddOfferPage,
  addOffer,
  getEditOffer,
  editOffer,
  deleteOffer,
};
