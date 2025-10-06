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

        // 🎯 Filter by status
        if (statusFilter) {
            query.status = new RegExp(`^${statusFilter}$`, 'i'); // case-insensitive
        }

        // 📌 Sorting
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
            .populate("user", "name email") // populate user info
            .limit(limit)
            .skip((page - 1) * limit)
            .sort(sortQuery)
            .lean()

        const noResults = orders.length === 0

        res.render('orders', {
            order: orders,
            currentPage: page,
            totalPages,
            search,
            statusFilter,
            sortOption,
            noResults,
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

        // Find order first
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
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

        // Update main order status
        order.status = newStatus;

        // Update each product itemStatus except cancelled/return requested
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

        // find order by its MongoDB _id
        const order = await Order.findById(orderId).populate('user');

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Update return details
        order.status = "Return Approved";   // ✅ update status
        order.returnVerified = true;
        order.returnRequested = false;
        order.paymentStatus = "Refunded";
        order.returnDate = new Date();

        // Add refund to wallet
        order.user.wallet = (order.user.wallet || 0) + order.finalAmount;
        await order.user.save();

        // 6. Increase product stock for each item
        for (const item of order.orderItems) {
            await Product.findByIdAndUpdate(item.product, { $inc: { quantity: item.quantity } });
        }


        await order.save();

        res.json({ success: true, message: "Return approved & refunded" });

    } catch (error) {
        console.error('[Error in accepting return request]', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};





const rejectReturnRequest = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Mark return as rejected
        order.status = "Return Rejected"; 
        order.returnRequested = false;
        order.returnVerified = false; // optional
        await order.save();

        res.json({ success: true, message: "Return request rejected successfully."});
    } catch (error) {
        console.error('[Error in rejecting return request]');
        return res.status(500).json({ success: false, message: 'Something went wrong while rejecting return request.'});
    }
}

module.exports = {
    getOrderPage,
    updateStatus,
    viewOrderDetails,
    acceptReturnRequest,
    rejectReturnRequest
}