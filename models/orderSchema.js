const mongoose = require('mongoose')
const { Schema } = mongoose
const { v4: uuidv4 } = require('uuid')

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: () => `ORD-${Date.now()}-${Math.floor(Math.random()*1000)}`,
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
        // original price
        price: {
            type: Number,
            default: 0
        },
        // price after offer applied
        finalPrice: {
            type: Number,
            default:0
        },
        // offer in percentage
        offerDiscount:{
            type:Number,
            default:0
        },
        // offer price
        offerDiscountAmount: {
            type:Number,
            default:0
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
    //sum of item finalPrice (after offer, before coupon)
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
    // minimum value to apply coupon
    minValue: {
        type: Number,
        default: 0
    },
    // coupon discount value
    discountAmount: {
        type: Number,
        default: 0
    },
    deliveryCharge: { type: Number, default: 50 },
    // final payable by user
    finalAmount: {
        type: Number,
        required: true
    },
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
        type: Date,
        default: Date.now()
    },
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
        enum: ['Pending', 'Paid', 'Failed', 'Refunded','Cancelled'],
        default: 'Pending'
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'online', 'wallet'],
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
    razorpayOrderId: {
        type: String,
        default: null
    }
}, { timestamps: true })

const Order = mongoose.model('Order', orderSchema)
module.exports = Order