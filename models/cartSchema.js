const mongoose = require('mongoose')
const { Schema } = mongoose

const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity: {
            type: Number,
            default: 1
        },
        price: {
            type: Number,
            required: true
        },
        totalPrice: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            // enum: ['Placed', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Returned', 'Failed'],
            default: 'Placed'
        },
        cancellationReason: {
            type: String,
            enum: ['None','Changed my mind','Ordered by mistake','Found a better price',
                  'Product not needed','Delivery too late','Other'],   // Default when not cancelled
            default: 'None'
        }
    }]
})

const Cart = mongoose.model("Cart", cartSchema)
module.exports = Cart