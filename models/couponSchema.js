const mongoose = require('mongoose')
const {Schema} = mongoose

const couponSchema = new Schema({
    // userId: [{
    //     type: Schema.Types.ObjectId,
    //     ref: "User"
    // }],
    code: {
        type: String,
        required: true
    },
    discountValue: {
        type: Number,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    minValue: {                  // The minimum cart amount to apply the coupon
        type: Number,
        default: 0
    },
    isListed: {
        type: Boolean,
        default: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    redeemedUsers: [{                    // Each user can use a coupon only one time.
        type: Schema.Types.ObjectId,
        ref: "User"
    }]
},{timestamps:true})

const Coupon = mongoose.model("Coupon",couponSchema)
module.exports = Coupon