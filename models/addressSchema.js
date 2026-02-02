const mongoose = require('mongoose')
const {Schema} = mongoose

const addressSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    address: [{
        name: {
            type: String,
            required: true
        },
        landmark: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        pincode: {
            type: Number,
            required: true
        },
        fullAddress: {
            type: String,
            required: true
        },
        phone: {
            type: String,
            required: true
        },
        altPhone: {
            type: String,
            // required: true
        },
        isDefault:{
            type:Boolean,
            default:false
        }
    }]
})

const Address = mongoose.model("Address",addressSchema)
module.exports = Address