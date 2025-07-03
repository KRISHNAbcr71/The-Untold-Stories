const mongoose = require('mongoose')
const {Schema} = mongoose

const couponSchema = new Schema({
    // userId: [{
    //     type: Schema.Types.ObjectId,
    //     ref: "User"
    // }],
    name: {
        type: String,
        required: true,
        unique: true
    },
    // createdOn: {
    //     type: Date,
    //     default: Date.now,
    //     required: true
    // },
    expireOn: {
        type: Date,
        required: true
    },
    offerPrice: {
        type: Number,
        required: true
    },
    minimumPrice: {                  // The minimum cart amount to apply the coupon
        type: Number,
        required: true
    },
    isListed: {
        type: Boolean,
        default: true
    },
    redeemedUsers: [{                    // Each user can use a coupon only one time.
        type: Schema.Types.ObjectId,
        ref: "User"
    }]
},{timestamps:true})

const Coupon = mongoose.model("Coupon",couponSchema)
module.exports = Coupon