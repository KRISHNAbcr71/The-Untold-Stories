const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");

const getAddressPage = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const addressData = await Address.findOne({ userId: userId });
    res.render("address", { user: userData, userAddress: addressData });
  } catch (error) {
    console.error("[Error in loading address page]", error);
    res.redirect("/pageNotFound");
  }
};

const addAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const source = req.query.source || "profile";
    res.render("add-address", { user: userData, source });
  } catch (error) {
    console.error("[Error in loading add address page]", error);
    res.redirect("/pageNotFound");
  }
};

const postAddAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findOne({ _id: userId });
    if (!userData) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let userAddress = await Address.findOne({ userId: userData._id });

    const {
      source,
      name,
      landmark,
      state,
      pincode,
      fullAddress,
      phone,
      altPhone,
    } = req.body;

    if (!name || !landmark || !state || !pincode || !fullAddress || !phone) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (!/^\d{10}$/.test(phone)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid phone number" });
    }

    if (altPhone && !/^\d{10}$/.test(altPhone)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid alternate phone" });
    }

    if (phone === altPhone) {
      return res
        .status(400)
        .json({ success: false, message: "Phone numbers must be different" });
    }

    let isDefault = false;
    if (!userAddress || userAddress.address.length === 0) {
      isDefault = true;
    }
    const newAddressData = {
      name,
      landmark,
      state,
      pincode,
      fullAddress,
      phone,
      altPhone,
      isDefault,
    };

    if (!userAddress) {
      const newAddress = new Address({
        userId: userData._id,
        address: [newAddressData],
      });

      await newAddress.save();
    } else {
      userAddress.address.push(newAddressData);
      await userAddress.save();
    }

    if (source === "checkout") {
      return res.json({
        success: true,
        message: "Address added successfully",
        redirect: "/checkout",
      });
    }

    res.json({
      success: true,
      message: "Address added successfully",
      redirect: "/address",
    });
  } catch (error) {
    console.error("[Error in adding address]", error);
    res.status(500).json({ success: false, message: "Failed to add address" });
  }
};

const getEditAddressPage = async (req, res) => {
  try {
    const addressId = req.query.id;
    const userId = req.session.user;
    const userData = await User.findOne({ _id: userId });
    if (!userData) return res.redirect("/login");
    const userAddresses = await Address.findOne({
      userId,
      "address._id": addressId,
    });
    const source = req.query.source || "profile";

    if (!userAddresses) return res.redirect("/pageNotFound");

    const addressData = userAddresses.address.find((item) => {
      return item._id.toString() === addressId.toString();
    });

    if (!addressData) return res.redirect("/pageNotFound");

    res.render("edit-address", {
      address: addressData,
      user: userData,
      source,
    });
  } catch (error) {
    console.error("[Error in loading edit address page]", error);
    res.redirect("/pageNotFound");
  }
};

const editAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userData = await User.findOne({ _id: userId });
    if (!userData) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { name, landmark, state, pincode, fullAddress, phone, altPhone } =
      req.body;

    // Backend validation
    if (!name || !landmark || !state || !pincode || !fullAddress || !phone) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (!/^\d{6}$/.test(pincode)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid pincode" });
    }

    if (!/^\d{10}$/.test(phone)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid phone number" });
    }

    if (altPhone && !/^\d{10}$/.test(altPhone)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid alternate phone number" });
    }

    if (phone === altPhone) {
      return res
        .status(400)
        .json({ success: false, message: "Phone numbers must be different" });
    }

    const findAddress = await Address.findOne({
      userId: userData._id,
      "address._id": addressId,
    });

    if (!findAddress)
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });

    const address = findAddress.address.id(addressId);
    address.set({
      name,
      landmark,
      state,
      pincode,
      fullAddress,
      phone,
      altPhone,
    });
    await findAddress.save();

    res.json({ success: true, message: "Address updated successfully" });
  } catch (error) {
    console.error("[Error in edit address]", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const addressDoc = await Address.findOne({userId, "address._id": addressId,});

    if (!addressDoc)
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });

    const addressToDelete = addressDoc.address.id(addressId);
    if (!addressToDelete) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    const wasDefault = addressToDelete.isDefault;
    addressDoc.address.pull(addressId)

    if (wasDefault && addressDoc.address.length > 0) {
      addressDoc.address[0].isDefault = true;
    }
    await addressDoc.save();

    res.json({ success: true, message: "Address deleted successfully" });

  } catch (error) {
    console.error("[Error in deleting address]", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

module.exports = {
  getAddressPage,
  addAddress,
  postAddAddress,
  getEditAddressPage,
  editAddress,
  deleteAddress,
};
