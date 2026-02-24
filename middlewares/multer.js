const multer = require("multer");
const path = require("path");

// Configure disk storage for product image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/productImages");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

// Configure disk storage for profile image uploads
const profileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/profileImages");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Image file type validation
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = "Only JPG, PNG, and GIF images are allowed.";
    cb(null, false);
  }
};

// Multer middleware to handle multiple product image uploads
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
}).fields([
  { name: "image1", maxCount: 1 },
  { name: "image2", maxCount: 1 },
  { name: "image3", maxCount: 1 },
]);

// Multer middleware to handle single profile image upload
const uploadProfileImage = multer({
  storage: profileStorage,
  fileFilter: fileFilter,
}).single("profileImage");

module.exports = { upload, uploadProfileImage };
