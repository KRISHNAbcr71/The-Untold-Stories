const mongoose = require('mongoose')
const { Schema } = mongoose
const { v4: uuidv4 } = require('uuid')

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: () => uuidv4(),
        required: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    orderItems: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            default: 0
        },
        // each product status
        itemStatus: {                     
        type: String,
        required: true,
        enum: [
            "Pending",
            "Shipped",
            "Out for Delivery",
            "Delivered",
            "Cancelled",
            "Return Requested",
            "Return Approved",
            "Return Rejected",
        ],
        default: 'Pending'
    },
    cancellationReason: { 
        type: String, 
        default: null 
    }
    }],
    subtotal: {
        type: Number,
        required: true
    },
    couponCode: {
        type: String,
        default: null
    },
    // coupon discount in percentage
    discount: {
        type: Number,
        default: 0
    },
    minValue: {
        type: Number,
        default: 0
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    // address: {
    //     type: Schema.Types.ObjectId,
    //     required: true
    // },
    // Store the snapshot of the address
    selectedAddress: {
        name: String,
        landmark: String,
        state: String,
        pincode: Number,
        fullAddress: String,
        phone: String,
        altPhone: String
    },
    invoiceDate: {
        type: Date
    },
    deliveryCharge: { type: Number, default: 50 },
    // Order status
    status: {                     
        type: String,
        required: true,
        enum: [
            "Pending",
            "Shipped",
            "Out for Delivery",
            "Delivered",
            "Cancelled",
            "Return Requested",
            "Return Approved",
            "Return Rejected",
        ],
        default: 'Pending'
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
        default: 'Pending'
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'razor', 'wallet'],
        default: 'cod'
    },
    orderCancellationReason: {
        type: String,
        default: null
    },
    returnReason: {
        type: String,
        default: null,
    },
    returnDate: {
        type: Date,
        default: null
    },
    returnRequested: { 
        type: Boolean, 
        default: false 
    },
    returnVerified: { 
        type: Boolean, 
        default: false 
    },
}, { timestamps: true })

const Order = mongoose.model('Order', orderSchema)
module.exports = Order