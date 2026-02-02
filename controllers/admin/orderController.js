const User = require('../../models/userSchema')
const Address = require('../../models/addressSchema')
const Order = require('../../models/orderSchema')
const Product = require('../../models/productSchema')





const getOrderPage = async (req, res) => {
    try {
        const search = req.query.search || ''
        const statusFilter = req.query.status || '';
        const sortOption = req.query.sort || 'date_desc';
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const limit = 5
        let query = {}

        if (search) {
            const users = await User.find({
                name: { $regex: search, $options: 'i' }
            }).select('_id')

            const userIds = users.map(u => u._id)

            query = {
                $or: [
                    { orderId: { $regex: search, $options: 'i' } },
                    { user: { $in: userIds } }
                ]
            }
        }

        // Filter by status
        if (statusFilter) {
            query.status = new RegExp(`^${statusFilter}$`, 'i');
        }

        // Sorting
        let sortQuery = {}
        switch (sortOption) {
            case 'date_asc': sortQuery = { createdAt: 1 }; break
            case 'date_desc': sortQuery = { createdAt: -1 }; break
            case 'amount_asc': sortQuery = { finalAmount: 1 }; break
            case 'amount_desc': sortQuery = { finalAmount: -1 }; break
            default: sortQuery = { createdAt: -1 }
        }

        const totalOrders = await Order.countDocuments(query)
        const totalPages = Math.ceil(totalOrders / limit)

        const orders = await Order.find(query)
            .populate("orderItems.product", "productName price productImage")
            .populate("user", "name email")
            .limit(limit)
            .skip((page - 1) * limit)
            .sort(sortQuery)
            .lean()

        const noResults = orders.length === 0

        //Build query string for pagination
        let queryString = ''
        if(search) queryString += `&search=${encodeURIComponent(search)}`
        if(statusFilter) queryString += `&status=${encodeURIComponent(statusFilter)}`
        if(sortOption) queryString += `&sort=${encodeURIComponent(sortOption)}`

        res.render('orders', {
            order: orders,
            currentPage: page,
            totalPages,
            search,
            statusFilter,
            sortOption,
            noResults,
            queryString
        })

    } catch (error) {
        console.error('[Error in loading order page]', error)
        res.redirect('/pageError')
    }
}





const updateStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status is required' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const lockedStatuses = [
            "Cancelled",
            "Return Requested",
            "Return Approved",
            "Return Rejected"
        ]

        if (lockedStatuses.includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: `Order status cannot be changed after ${order.status}`
            });
        }

        const validStatuses = ["Pending", "Shipped", "Out for Delivery", "Delivered", "Cancelled"];

        let newStatus;
        if (status.toLowerCase() === "out for delivery") {
            newStatus = "Out for Delivery";
        } else {
            newStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
        }

        if (!validStatuses.includes(newStatus)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        order.status = newStatus;

        if (order.paymentMethod === "cod") {
            const hasActiveItems = order.orderItems.some(
                item => item.itemStatus !== "Cancelled"
            );

            if (!hasActiveItems) {
                order.paymentStatus = "Failed";
            } else if (newStatus === "Delivered") {
                order.paymentStatus = "Paid";
            } else {
                order.paymentStatus = "Pending";
            }
        }

        order.orderItems.forEach(item => {
            if (
                item.itemStatus !== "Cancelled" &&
                item.itemStatus !== "Return Requested" &&
                item.itemStatus !== "Return Approved" &&
                item.itemStatus !== "Return Rejected"
            ) {
                item.itemStatus = newStatus;
            }
        });

        await order.save();

        res.json({ success: true, status: order.status });

    } catch (error) {
        console.error('[Error in updating status]', error);
        return res.status(500).json({ success: false, message: 'Something went wrong' });
    }
};





const viewOrderDetails = async (req, res) => {
    try {
        const { orderId } = req.params
        const order = await Order.findById(orderId)
            .populate('user', 'name email')
            .populate('orderItems.product', 'productName price')
            .lean();
        if (!order) return res.status(404).json({ error: "Order not found" });

        res.json(order)

    } catch (error) {
        console.error('[Error in view order details]', error)
        res.status(500).json({ error: "Something went wrong" });
    }
}






const acceptReturnRequest = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        // Check if order is in return requested status
        if (order.status !== "Return Requested") {
            return res.status(400).json({
                success: false,
                message: 'Order is not in "Return Requested" status'
            });
        }

        const refundAmount = order.finalAmount
        await User.findByIdAndUpdate(order.user._id,{
            $inc:{'wallet.balance':refundAmount},
            $push:{
                'wallet.transactions':{
                    type:'refund',
                    amount:refundAmount,
                    description:`Refund for order ${order.orderId}`,
                    orderId:order._id,
                    status:'completed'
                }
            }
        })

        // Update return details
        order.status = "Return Approved";
        order.returnVerified = true;
        order.returnRequested = false;
        order.paymentStatus = "Refunded";
        order.returnDate = new Date();

        // Update each item's status
        order.orderItems.forEach(item => {
            if (item.itemStatus === "Return Requested") {
                item.itemStatus = "Return Approved";
            }
        });

        // Increase product stock for each item
        for (const item of order.orderItems) {
            if (item.itemStatus === "Return Approved") {
                await Product.findByIdAndUpdate(
                    item.product, 
                    { $inc: { quantity: item.quantity } }
                );
            }
        }

        await order.save();

        res.json({ 
            success: true, 
            message: "Return approved successfully. Product stock has been restored.",
            data: {
                orderId: order.orderId,
                status: order.status,
                returnDate: order.returnDate
            }
        });

    } catch (error) {
        console.error('[Error in accepting return request]', error);
        res.status(500).json({ 
            success: false, 
            message: "Server error while accepting return request",
            error: error.message 
        });
    }
};



const rejectReturnRequest = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        // Check if order is in return requested status
        if (order.status !== "Return Requested") {
            return res.status(400).json({
                success: false,
                message: 'Order is not in "Return Requested" status'
            });
        }

        // Update return details
        order.status = "Return Rejected";
        order.returnVerified = false;
        order.returnRequested = false;
        order.paymentStatus = "Paid";
        order.returnDate = new Date();

        // Update each item's status
        order.orderItems.forEach(item => {
            if (item.itemStatus === "Return Requested") {
                item.itemStatus = "Return Rejected";
            }
        });

        await order.save();

        res.json({ 
            success: true, 
            message: "Return request rejected successfully"
        });

    } catch (error) {
        console.error('[Error rejecting return request:]', error);
        res.status(500).json({ 
            success: false, 
            message: "Server error while rejecting return request",
            error: error.message 
        });
    }
};



module.exports = {
    getOrderPage,
    updateStatus,
    viewOrderDetails,
    acceptReturnRequest,
    rejectReturnRequest
}