const multer = require('multer')
const path = require('path')

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // console.log("Uploading file to: public/uploads/productImages");
    cb(null, "public/uploads/productImages");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + path.extname(file.originalname);
    console.log(`Saving file with name: ${uniqueName}`);
    cb(null, uniqueName);
  },
});

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------

const bannerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const bannerPath = path.join(__dirname, "../public/uploads/bannerImages/");
    cb(null, bannerPath);
  },
  filename: function (req, file, cb) {
    cb(null, "banner_" + Date.now() + path.extname(file.originalname));
  },
});
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------

const profileStorage = multer.diskStorage({
  destination: function(req,file,cb){
    cb(null, "public/uploads/profileImages");
  },
  filename: function(req,file,cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
  if (allowedTypes.includes(file.mimetype)) {
    console.log(`Allowed file type: ${file.mimetype}`);
    cb(null, true);
  } else {
    console.log(`Disallowed file type: ${file.mimetype}`);
    cb(new Error("Invalid file type"), false);
  }
};
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
}).fields([
  { name: "image1", maxCount: 1 },
  { name: "image2", maxCount: 1 },
  { name: "image3", maxCount: 1 },
]);

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------

const uploadBanner = multer({
  storage: bannerStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("image1");
// --------------------------------------------------------------------------------------------------------------------------------------------------------------------

const uploadProfileImage = multer({
  storage: profileStorage,
  fileFilter: fileFilter
}).single("profileImage")

// --------------------------------------------------------------------------------------------------------------------------------------------------------------------
module.exports = { upload, uploadBanner, uploadProfileImage };