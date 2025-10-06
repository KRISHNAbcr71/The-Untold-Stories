const Coupon = require('../../models/couponSchema')


const getCoupons = async (req, res) => {
    try {
        const today = new Date()

        const coupons = await Coupon.find({
            isDeleted: { $ne: true },
            startDate: { $lte: today },   // already started
            endDate: { $gte: today }
        });

        res.json(coupons)

    } catch (error) {
        console.error(error)
        res.redirect('/pageError')
    }
}



const applyCoupon = async (req, res) => {
    try {
        const { couponCode, subtotal } = req.body;
        const today = new Date();

        const coupon = await Coupon.findOne({
            code: couponCode,
            isDeleted: { $ne: true },
            startDate: { $lte: today },
            endDate: { $gte: today }
        });

        if (!coupon)
            return res.status(400).json({ success: false, message: "Invalid or expired coupon" })

        if (subtotal < coupon.minValue) {
            return res.status(400).json({ success: false, message: `Minimum order ${coupon.minValue} required` })
        }

        const discountAmount = Math.floor((subtotal * coupon.discountValue) / 100);

        const shipping = 50

        const total = subtotal - discountAmount + shipping;

        res.json({
            success: true,
            couponCode,
            discountAmount,
            shipping,
            total
        });
    } catch (error) {
        console.error('[Error in applying coupon ]', error)
        res.status(500).json({ success: false, message: 'Server Error' })
    }
}


const removeCoupon = async (req, res) => {
    try {
        const { subtotal } = req.body
        const discountAmount = 0
        const shipping = 50
        const total = parseFloat(subtotal) + shipping

        res.json({
            success: true,
            couponCode: null,
            discountAmount,
            shipping,
            total
        });
    } catch (error) {
        console.error('[Error in removing coupon]', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}


module.exports = {
    getCoupons,
    applyCoupon,
    removeCoupon
}