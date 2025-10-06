const User = require('../../models/userSchema')
const Coupon = require('../../models/couponSchema')

const getCouponPage = async (req, res) => {
    try {
        const search = req.query.search || ''
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = 5

        const query = {
            ...(
                search ? { code: { $regex: search, $options: 'i' } } : {}
            ),
            isDeleted: { $ne: true } // exclude soft-deleted coupons
        };

        const totalCoupons = await Coupon.countDocuments(query);
        const totalPages = Math.ceil(totalCoupons / limit);

        const coupons = await Coupon.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ createdAt: -1 })

        const currentDate = new Date();

        const couponWithStatus = coupons.map(coupon => {
            let status = 'Expired'
            const now = new Date()
            if (now < coupon.startDate) {
                status = 'Upcoming'
            } else if (now >= coupon.startDate && now <= coupon.endDate) {
                status = 'Active'
            } else if (now > coupon.endDate) {
                status = 'Expired'
            }


            return { ...coupon.toObject(), status }
        });

        const noResults = coupons.length === 0

        res.render('coupon', {
            coupons: couponWithStatus,
            currentPage: page,
            totalPages,
            search,
            noResults
        })

    } catch (error) {
        console.error('[Error in loading coupon page]', error)
        res.redirect('/pageError')
    }
}



const getAddCouponPage = async (req, res) => {
    try {
        res.render('add-coupon')
    } catch (error) {
        console.error("[Error loading Add Coupon Page]", error);
        res.redirect('/pageError');
    }
}



const addCoupon = async (req, res) => {
    try {
        const { code, startDate, endDate, discountValue, minValue } = req.body;

        const existingCoupon = await Coupon.findOne({ code: code.trim().toUpperCase(), isDeleted:false});
        const now = new Date()

        if (existingCoupon)
            return res.status(400).json({ message: "Coupon already exists!" })


        const newCoupon = new Coupon({
            code: code.trim().toUpperCase(),
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            discountValue: Number(discountValue),
            minValue: minValue ? Number(minValue) : 0
        });

        await newCoupon.save()
        return res.json({ message: "Coupon added successfully" })
    } catch (error) {
        console.error('[Error in adding coupon]', error)
        res.redirect('/pageError')
    }
}


const getEditCoupon = async (req, res) => {
    try {

        const id = req.query.id
        const coupon = await Coupon.findOne({ _id: id })

        if (!coupon)
            return res.status(404).json({ success: false, message: 'Coupon not found' })

        res.render('edit-coupon', { coupon })

    } catch (error) {
        console.error('[Error in loading edit coupon page]', error)
        res.redirect('/pageError')

    }
}



const editCoupon = async (req, res) => {
    try {
        const { id } = req.params

        const { code, startDate, endDate, discountValue, minValue } = req.body

        const existingCoupon = await Coupon.findOne({ code: code.trim().toUpperCase(), _id: { $ne: id } });

        if (existingCoupon)
            return res.status(400).json({ message: 'Coupon code already exists!' })

        await Coupon.findByIdAndUpdate(id, {
            code: code.trim().toUpperCase(),
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            discountValue: Number(discountValue),
            minValue: minValue ? Number(minValue) : 0
        });

        res.status(200).json({ message: 'Coupon edited successfully!' })

    } catch (error) {
        console.error('[Error in updating coupon]', error)
        res.redirect('/pageError')
    }
}



const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params

        const coupon = await Coupon.findByIdAndUpdate(id, { isDeleted: true }, { new: true })

        if (!coupon)
            return res.status(404).json({ success: false, message: 'Coupon not found' })

        return res.status(200).json({ success: true, message: 'Coupon deleted' })

    } catch (error) {
        console.error('[Error in deleting coupon]', error)
        res.status(500).json({ success: false, message: 'Something went wrong' })


    }
}

module.exports = {
    getCouponPage,
    getAddCouponPage,
    addCoupon,
    getEditCoupon,
    editCoupon,
    deleteCoupon
}