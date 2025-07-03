
const mongoose = require('mongoose')
const {Schema} = mongoose

const userSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        unique: true,
        sparse: true,
        default: null
        // type: String,
        // required: false,
        // unique: false,      // optional, not needed if false
        // sparse: false,      // optional, usually needed when `unique: true` and optional field
        // default: null       //  To explicitly store null when a value isn't given.
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    password: {
        type: String,
        required: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    cart: [{
        type: Schema.Types.ObjectId,
        ref: "Cart"
    }],
    wallet: {
        type: Number,
        default: 0
    },
    wishlist: [{
        type: Schema.Types.ObjectId,
        ref: "Wishlist"
    }],
    orderHistory: [{
        type: Schema.Types.ObjectId,
        ref: "Order"
    }],
    createdOn: {    // Date of account creation
        type: Date,
        default: Date.now
    },
    referalCode: {
        type: String
    },
    redeemed: {
        type: Boolean
    },
    redeemedUsers: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref: "Category"
        },
        priceRange: {
            min: {type: Number, default: null },
            max: {type: Number, default: 9007199254740991 }
        },
        sortBy: {
            type: String,
            enum: ['priceLow', 'priceHigh', 'nameAZ', 'nameZA'],
            default: null
        },
        searchOn: {
            type: Date,
            default: Date.now
        }
    }]
})


const User = mongoose.model("User",userSchema)
module.exports = User