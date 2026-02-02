
const multer = require('multer')
const path = require('path')





// Product Image Storage
// ---------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/productImages");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});




// Profile Image Storage
// ---------------------
const profileStorage = multer.diskStorage({
  destination: function(req,file,cb){
    cb(null, "public/uploads/profileImages");
  },
  filename: function(req,file,cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});





// File Filter
// -----------
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = "Only JPG, PNG, and GIF images are allowed."
    cb(null,false)
  }
};






// Product Image Upload
// --------------------
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
}).fields([
  { name: "image1", maxCount: 1 },
  { name: "image2", maxCount: 1 },
  { name: "image3", maxCount: 1 },
]);





// Profile Image Upload
// --------------------
const uploadProfileImage = multer({
  storage: profileStorage,
  fileFilter: fileFilter
}).single("profileImage")





module.exports = { upload, uploadProfileImage };
