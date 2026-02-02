const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    default: null,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  password: {
    type: String,
    required: false,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  cart: [
    {
      type: Schema.Types.ObjectId,
      ref: "Cart",
    },
  ],
  wishlist: [
    {
      type: Schema.Types.ObjectId,
      ref: "Wishlist",
    },
  ],
  orderHistory: [
    {
      type: Schema.Types.ObjectId,
      ref: "Order",
    },
  ],
  createdOn: {
    // Date of account creation
    type: Date,
    default: Date.now,
  },
  referralCode: {
    type: String,
    unique: true
  },
  referredBy: {
    type: Schema.Types.ObjectId,
    ref:"User",
    default:null
  },
  referralRewardCredited: {
    type:Boolean,
    default:false
  },
  searchHistory: [
    {
      category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
      priceRange: {
        min: { type: Number, default: null },
        max: { type: Number, default: 9007199254740991 },
      },
      sortBy: {
        type: String,
        enum: ["priceLow", "priceHigh", "nameAZ", "nameZA"],
        default: null,
      },
      searchOn: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  profileImage: {
    type: String,
    default: "",
  },

  wallet: {
    type: {
      balance: {
        type: Number,
        default: 0,
        min: 0,
      },
      transactions: [
        {
          type: {
            type: String,
            enum: ["credit", "debit", "refund", "payment","referral"],
            required: true,
          },
          amount: {
            type: Number,
            required: true,
            min: 0,
          },
          description: {
            type: String,
            required: true,
          },
          orderId: {
            type: Schema.Types.ObjectId,
            ref: "Order",
            default: null,
          },
          razorpayOrderId: {
            type: String,
            default: null,
          },
          razorpayPaymentId: {
            type: String,
            default: null,
          },
          status: {
            type: String,
            enum: ["pending", "completed", "failed", "cancelled"],
            default: "pending",
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },
    default: () => ({ 
      balance: 0, 
      transactions: [] 
    }),
  },
});

const User = mongoose.model("User", userSchema);
module.exports = User;
