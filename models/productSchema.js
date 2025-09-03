const mongoose = require('mongoose')
const {Schema} = mongoose

const productSchema = new Schema({
    productName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    // pages: {
    //     type: Number,
    //     required: true
    // },
    author: {
        type: String,
        required: true
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    // regularPrice: {
    //     type: Number,
    //     required: true
    // },
    price: {
        type: Number,
        required: true
    },
    // salePrice: {
    //     type: Number,
    //     required: true
    // },
    // productOffer: {
    //     type: Number,
    //     default: 0
    // },
    quantity: {
        type: Number,
        required: true,
        min: [0, 'Quantity cannot be negative']
    },
    productImage: {
        type: [String],
        required: true
    },
    isListed: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['Available','Out of stock','Unavailable'],
        required: true,
        default: 'Available'
    },
    isDeleted: {
        type: Boolean, 
        default: false
    },
    deletedAt: {
        type: Date,
        default: null
    },
},{timestamps:true})

const Product = mongoose.model("Product",productSchema)
module.exports = Product