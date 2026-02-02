const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  discountValue: { type: Number, required: true },
  appliesTo: { type: String, enum: ["product", "category"], required: true },
  targetIds: [{ type: mongoose.Schema.Types.ObjectId, refPath: 'appliesTo'}],
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});


// Update updatedAt on save
offerSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

const Offer = mongoose.model("Offer",offerSchema)
module.exports = Offer
