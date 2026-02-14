const mongoose = require('mongoose')
const {Schema} = mongoose

const couponSchema = new Schema({
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
    minValue: {                  
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
    usedUsers: [{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    }]
},{timestamps:true})

const Coupon = mongoose.model("Coupon",couponSchema)
module.exports = Coupon