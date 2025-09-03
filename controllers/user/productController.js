const Product = require('../../models/productSchema')
const Category = require('../../models/categorySchema')
const User = require('../../models/userSchema')


const loadProductDetailsPage = async(req,res)=>{
    try {
        const userId = req.session.user 
        const userData = await User.findById(userId)
        const productId = req.query.id 
        //const product= await Product.findById(productId).populate('category')
        const product = await Product.findOne({_id:productId, isListed: true}).populate('category')
        

        if(!product || product.quantity <= 0){
            return res.redirect('/shop')
        }

        const findCategory = product.category

        const relatedProducts = await Product.find({ category: product.category._id, _id: { $ne: productId } }).limit(4);

        res.render('product-details',{
            user: userData,
            product,
            category: findCategory,
            relatedProducts
        })
    } catch (error) {
        console.error('[Error for fetching product details]',error)
        res.redirect('/pageNotFound')
        
    }
}


module.exports = {
    loadProductDetailsPage
}