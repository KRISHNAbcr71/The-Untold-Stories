const User = require('../../models/userSchema')
const Product = require('../../models/productSchema')
const Address = require('../../models/addressSchema')
const Order = require('../../models/orderSchema')
const Coupon = require('../../models/couponSchema')
const Cart = require('../../models/cartSchema')
const PDFDocument = require('pdfkit')


const getCheckoutPage = async (req, res) => {
    try {
        const userId = req.session.user
        if (!userId) return res.redirect('/login')
        const userData = await User.findById(userId)

        const today = new Date()

        const coupons = await Coupon.find({
            isDeleted: { $ne: true },
            startDate: { $lte: today },
            endDate: { $gte: today }
        });

        const cart = await Cart.findOne({ userId }).populate("items.productId")
        const addressData = await Address.findOne({ userId })


        const subtotal = cart.items.reduce((acc, item) => {
            return acc + item.price * item.quantity
        }, 0)

        const shipping = 50
        const total = subtotal + shipping

        res.render('checkout', {
            user: userData,
            addressData,
            cart,
            subtotal,
            total,
            coupons
        })

    } catch (error) {
        console.log("Error loading checkout page:", error);
        res.redirect('/pageNotFound')
    }
}






const placeOrder = async (req, res) => {
    try {
        // const {addressId, payment, finalAmount, discountAmount, couponCode} = req.body
        const { addressId, payment, couponCode } = req.body;

        const userId = req.session.user

        const today = new Date();

        const coupon = await Coupon.findOne({
            code: couponCode,
            isDeleted: { $ne: true },
            startDate: { $lte: today },
            endDate: { $gte: today }
        });

        if (payment !== 'cod')
            return res.status(400).json({ success: false, message: 'Only Cash on Delivery is supported for now' })

        const cart = await Cart.findOne({ userId }).populate('items.productId')

        if (!cart || cart.items.length === 0)
            return res.status(400).json({ success: false, message: 'Cart is empty' })

        // Fetch the selected address object
        // const addressDoc = await Address.findOne({ "address._id": addressId });
        const addressDoc = await Address.findOne({ "address._id": addressId });
        //console.log("addressDoc: ",addressDoc);
        if (!addressDoc)
            return res.status(400).json({ success: false, message: 'Invalid address selected' });

        // If you allow multiple addresses in one Address doc, you might want to select a specific one
        // Here we assume addressId points to the correct Address document and pick the first address
        // Find the specific address in the array
        const selectedAddress = addressDoc.address.id(addressId);
        if (!selectedAddress) return res.status(400).json({ success: false, message: 'Invalid address selected' });
        //console.log("Selected Address: ", selectedAddress);

        const orderItems = cart.items.map(item => ({
            product: item.productId._id,
            quantity: item.quantity,
            price: item.productId.price
        }));

        for (const item of cart.items) {
            if (item.productId.quantity < item.quantity)
                return res.status(400).json({ success: false, message: `Not enough stock for ${item.productId.name}` })
        }



        // 1️⃣ Fetch coupon details
        let discount = 0;
        let minValue = 0;

        if (couponCode) {
            // const coupon = await Coupon.findOne({ code: couponCode, isDeleted: {$ne: true} });
            if (coupon) {
                discount = coupon.discountValue;  // % discount
                minValue = coupon.minValue;       // min cart value
            }
        }

        // 2️⃣ Calculate subtotal
        const subtotal = cart.items.reduce((acc, item) => acc + item.productId.price * item.quantity, 0);

        // 3️⃣ Calculate discount amount
        const discountAmountApplied = subtotal >= minValue ? Math.floor(subtotal * discount / 100) : 0;

        // 4️⃣ Final amount including delivery charge
        const deliveryCharge = cart.deliveryCharge || 50; // or get from orderSchema default
        const finalAmount = subtotal - discountAmountApplied + deliveryCharge;





        const newOrder = new Order({
            user: userId,
            orderItems,
            // totalPrice: cart.totalPrice,
            subtotal,
            couponCode: couponCode || null,
            discount, // store % discount
            minValue,       // store min value
            discountAmount: discountAmountApplied,
            finalAmount,
            selectedAddress,
            invoiceDate: new Date(),
            status: 'Pending',
            paymentMethod: 'cod',
            paymentStatus: 'Pending',
            // couponCode: couponCode || null,
            // discountAmount: discountAmount || 0
        });


        await newOrder.save();

        for (const item of cart.items) {
            await Product.findByIdAndUpdate(item.productId._id, { $inc: { quantity: -item.quantity } }, { new: true })
        }



        await Cart.updateOne({ userId }, { $set: { items: [] } });

        return res.json({ success: true, message: 'Order placed successfully', orderId: newOrder.orderId })

    } catch (error) {
        console.error("Error placing COD order:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}



const orderSuccess = async (req, res) => {
    try {
        const userId = req.session.user
        const userData = await User.findById(userId);
        res.render('order-success', { user: userData })
    } catch (error) {
        console.error('Error loading order success page:', error);
        res.status(500).send('Something went wrong!');

    }
}





const getMyOrderPage = async (req, res) => {
    try {
        const userId = req.session.user
        const userData = await User.findById(userId)
        const search = req.query.search || ''
        let query = { user: userId }
        if (search)
            query.orderId = { $regex: search, $options: 'i' }

        const orders = await Order.find(query)
            .populate('orderItems.product', 'productName price productImage')
            .sort({ createdAt: -1 })

        const formattedOrder = orders.map(order => ({
            orderId: order.orderId,
            status: order.status,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            finalAmount: order.finalAmount,
            discountAmount: order.discountAmount,
            deliveryCharge: order.deliveryCharge,
            invoiceDate: order.invoiceDate,
            items: order.orderItems.map(item => ({
                productId: item.product._id,
                productName: item.product.productName,
                quantity: item.quantity,
                price: item.price,
                image: item.product.productImage && item.product.productImage[0],
                itemStatus: item.itemStatus,
                cancellationReason: item.cancellationReason
            }))
        }));



        res.render('my-order', { user: userData, orders: formattedOrder, search })

    } catch (error) {
        console.error('[Error in loading my order page]', error)
        res.redirect('/pageError')

    }
}




const cancelSpecificProduct = async (req, res) => {
    try {
        const { orderId, productId } = req.params
        // console.log("Order ID:", orderId);
        // console.log("Product ID:", productId);


        const { reason } = req.body


        // 1. Find the order
        const order = await Order.findOne({ orderId }).populate("orderItems.product")
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' })

        // 2. Find the specific product item
        const item = order.orderItems.find(i => i.product._id.toString() === productId);
        if (!item) return res.status(404).json({ success: false, message: 'Product not found in this order' });

        // 3. Check if product is already cancelled or delivered
        if (['Cancelled', 'Shipped', 'Delivered'].includes(item.itemStatus))
            return res.status(400).json({ success: false, message: `Cannot cancel a ${item.itemStatus.toLowerCase()} product` });

        // 4.  check 10-day cancellation window
        // const orderDate = new Date(order.invoiceDate);
        // const now = new Date();
        // const diffDays = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));
        // if(diffDays >= 10) return res.status(400).json({success: false, message: 'Cancellation period expired'});

        // 5. update the item status to cancelled and store reason
        item.itemStatus = 'Cancelled';
        item.cancellationReason = reason;

        // 6. Recalculate order final amount & adjust discount if any
        const activeItems = order.orderItems.filter(i => i.itemStatus !== 'Cancelled');
        const newSubtotal = activeItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

        let newDiscountAmount = 0;
        let couponRemoved = false;

        if (order.couponCode) {
            if (newSubtotal >= order.minValue) {
                newDiscountAmount = Math.floor(newSubtotal * order.discount / 100);
            } else {
                order.couponCode = null;
                order.discount = 0;
                order.minValue = 0;
                couponRemoved = true
            }
        }

        order.discountAmount = newDiscountAmount;

        order.finalAmount = Math.max(0, newSubtotal - order.discountAmount + order.deliveryCharge);

        if (activeItems.length === 0) {
            order.status = 'Cancelled';
            //console.log("Order fully cancelled:", order.orderId);
            order.finalAmount = 0;
            order.discountAmount = 0;
            order.deliveryCharge = 0;
            order.couponCode = null;
        }

        await order.save()

        // 8. Increase product stock
        await Product.findByIdAndUpdate(productId, { $inc: { quantity: item.quantity } });

        if (couponRemoved)
            return res.json({ success: true, message: 'Product cancelled successfully. Coupon removed as order value fell below minimum.', couponRemoved: true, finalAmount: order.finalAmount })

        res.json({ success: true, message: "Product cancelled successfully.", couponRemoved: false, finalAmount: order.finalAmount });

    } catch (error) {
        console.error("Error cancelling product:", error);
        res.status(500).json({ success: false, message: "Server error while cancelling product" });

    }
}





const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;

        // 1. Find the order
        const order = await Order.findOne({ orderId }).populate("orderItems.product");
        if (!order)
            return res.status(404).json({ success: false, message: 'Order not found' });

        // 2. Check if order is already cancelled
        if (['Cancelled', 'Shipped', 'Delivered'].includes(order.status))
            return res.status(400).json({ success: false, message: `Cannot cancel a ${order.status.toLowerCase()} product` });

        // 3. Check 24-hour cancellation window
        const orderDate = new Date(order.invoiceDate);
        const now = new Date();
        const diffHours = (now - orderDate) / (1000 * 60 * 60);

        if (diffHours > 24) {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel order. Cancellation period of 24 hours has expired.'
            });
        }


        // 4. Cancel all items
        order.orderCancellationReason = reason || 'Order cancelled';
        order.orderItems.forEach(item => item.itemStatus = 'Cancelled');

        // 5. Mark order as cancelled
        order.status = 'Cancelled';
        // order.finalAmount = 0;
        // order.discountAmount = 0;
        // order.deliveryCharge = 0;
        order.couponCode = null;


        await order.save();

        // 6. Increase product stock for each item
        for (const item of order.orderItems) {
            await Product.findByIdAndUpdate(item.product, { $inc: { quantity: item.quantity } });
        }

        res.json({
            success: true,
            message: 'Order cancelled successfully',
        });

    } catch (error) {
        console.error('[Error cancelling order]', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};




const viewOrderDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user
        if (!userId) return res.redirect('/login')
        const userData = await User.findById(userId)

        const order = await Order.findOne({ orderId })
            .populate("orderItems.product", "productName price quantity productImage")

        //console.log("Order: ", order);


        if (!order)
            return res.status(404).json({ success: false, message: 'Order not found' })

        return res.render('view-order', { order, user: userData })

    } catch (error) {
        console.error("Error fetching order details:", error);
        res.status(500).json({ message: "Server error" });
    }
}





const returnOrder = async(req,res) => {
    try {
        const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Return reason is required' });
    }

    // Find the order
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Only delivered orders can be returned
    if (order.status.toLowerCase().trim() !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
    }

    // Check if the order was delivered within the last 10 days
    const today = new Date();
    const deliveredDate = new Date(order.deliveredDate);
    const diffTime = today - deliveredDate; // difference in milliseconds
    const diffDays = diffTime / (1000 * 60 * 60 * 24); // convert to days

    if (diffDays > 10) {
      return res.status(400).json({ success: false, message: 'Return period has expired. Returns allowed only within 10 days of delivery.' });
    }

    // Update order for return
    order.returnReason = reason;
    order.returnDate = today;
    order.returnRequested = true;
    order.status = 'Return Requested';

    await order.save();

    return res.json({ success: true, message: 'Order returned successfully' });
    } catch (error) {
        console.error('[Error in return order]', error);
        return res.status(500).json({ success: false, message: 'Something went wrong' });
    }
}





const getInvoicePage = async (req, res) => {
    try {
        const { orderId } = req.params
        const userId = req.session.user
        if (!userId) return res.redirect('/login')
        const userData = await User.findById(userId)

        const order = await Order.findOne({ orderId })
            .populate("orderItems.product", "productName price productImage")

        if (!order)
            return res.status(404).json({ success: false, message: 'Order not found' });

        res.render('invoice', { order, user: userData });

    } catch (error) {
        console.error("Error loading invoice page:", error);
        res.status(500).send("Server error");
    }
}





const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user;
        if (!userId) return res.redirect("/login");
        const order = await Order.findOne({ orderId })
            .populate("orderItems.product", "productName price productImage");
        if (!order) return res.status(404).send("Order not found");

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=invoice-${orderId}.pdf`
        );

        doc.pipe(res);

        // Header
        doc.fillColor("#fca311").fontSize(22).text("Invoice", { align: "center" });

        // Full-width underline (like <hr>)
        const pageMargin = 50; // same margin you used when creating PDFDocument({ margin: 50 })
        const pageWidth = doc.page.width - pageMargin * 2;

        doc.moveTo(pageMargin, doc.y + 5)   // left margin
            .lineTo(pageMargin + pageWidth, doc.y + 5) // right margin
            .strokeColor("#fca311")
            .lineWidth(1)
            .stroke();

        doc.moveDown(2);
        doc.fillColor("black");


        doc.fontSize(12).text(`Invoice No: INV${order._id.toString().slice(-6)}`);
        doc.text(`Order ID: ${order.orderId}`);
        doc.text(`Customer Name: ${order.selectedAddress.name}`);
        doc.text("Address:");
        doc.text(`${order.selectedAddress.fullAddress}`);
        doc.text(`${order.selectedAddress.landmark}`);
        doc.text(`${order.selectedAddress.state} - ${order.selectedAddress.pincode}`);
        doc.text(`Phone: ${order.selectedAddress.phone}`);
        if (order.selectedAddress.altPhone) doc.text(`Alt Phone: ${order.selectedAddress.altPhone}`);
        doc.text(`Date: ${order.invoiceDate.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
        })}`);

        // Table Header
        const tableTop = doc.y + 20;
        doc.rect(50, tableTop, 500, 20).fill("#fca311"); // Orange header background
        doc.fillColor("white").font("Helvetica-Bold").fontSize(12);
        doc.text("Product", 60, tableTop + 5);
        doc.text("Qty", 250, tableTop + 5);
        doc.text("Price", 300, tableTop + 5);
        doc.text("Total", 370, tableTop + 5);

        doc.fillColor("black").font("Helvetica").fontSize(11);

        // Table Rows
        let y = tableTop + 25;
        const colX = [50, 250, 300, 370, 550]; // column boundaries

        order.orderItems.forEach((item) => {
            // Row border (top + bottom line)
            doc.rect(50, y - 5, 500, 20).stroke();

            // Vertical lines for columns
            colX.forEach(x => {
                doc.moveTo(x, y - 5).lineTo(x, y + 15).stroke();
            });

            // Row data
            doc.text(item.product.productName, 60, y);
            doc.text(item.quantity.toString(), 250 + 5, y);
            doc.text(`${item.price}`, 300 + 5, y);
            doc.text(`${item.price * item.quantity}`, 370 + 5, y);

            y += 20;
        });

        y += 40;

        // Payment info (left side)
        doc.font("Helvetica-Bold").text("Payment Method:", 50, y);
        doc.font("Helvetica").text(order.paymentMethod, 170, y);

        y += 20;
        doc.font("Helvetica-Bold").text("Payment Status:", 50, y);
        doc.font("Helvetica").text(order.paymentStatus, 170, y);

        // Totals (right side)
        doc.font("Helvetica-Bold").text(`Subtotal: ₹${order.subtotal}`, 350, y - 40, { align: "right" });
        doc.text(`Discount: ₹${order.discountAmount}`, 350, y - 20, { align: "right" });
        doc.text(`Delivery: ₹${order.deliveryCharge}`, 350, y, { align: "right" });
        doc.text(`Final Amount: ₹${order.finalAmount}`, 350, y + 20, { align: "right" });


        doc.moveDown(4);











        // Footer line
        doc.moveDown(4); // some space before the line
        doc.moveTo(pageMargin, doc.y)                  // start X,Y
            .lineTo(pageMargin + pageWidth, doc.y)     // end X,Y
            .strokeColor("#fca311")
            .lineWidth(1)
            .stroke();

        doc.moveDown(2); // space after line

        doc.fontSize(12)
            .fillColor("#555")
            .text("Thank you for your purchase!", 50, doc.y, {
                width: pageWidth,
                align: "center"
            });


        doc.end();

    } catch (error) {
        console.error("Error generating invoice PDF:", error);
        res.status(500).send("Server error");
    }
}




module.exports = {
    getCheckoutPage,
    placeOrder,
    orderSuccess,
    getMyOrderPage,
    cancelSpecificProduct,
    cancelOrder,
    viewOrderDetails,
    returnOrder,
    getInvoicePage,
    downloadInvoice

}