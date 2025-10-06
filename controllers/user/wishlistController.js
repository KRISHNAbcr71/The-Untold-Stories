const User = require('../../models/userSchema')
const Product = require('../../models/productSchema')
const Category = require('../../models/categorySchema')
const Cart = require('../../models/cartSchema')
const Wishlist = require('../../models/wishlistSchema')


const getWishlistPage = async(req,res) => {
    try {
        const userId = req.session.user
        const userData = await User.findById(userId)
        if(!userData) return res.redirect('/login')

        let wishlist = await Wishlist.findOne({userId}).populate('products.productId')

        if(!wishlist) {
            wishlist = { products: [] }
        }

        res.render('wishlist', {wishlist, user:userData})
        
    } catch (error) {
        console.error("[Error in loading wishlist page]", error)
        res.redirect('/pageNotFound')
        
    }
}




const addToWishlist = async(req,res) => {
    try {
        const userId = req.session.user 
        const productId = req.params.productId

        if(!userId) return res.status(401).json({message: 'Please login to continue'})
        

        const product = await Product.findById(productId).populate('category')
        if(!product) return res.status(404).json({message:'Product not found'})
        if(!product.isListed || product.isDeleted) return res.status(400).json({message: "This product is not available"})
        if(!product.category || !product.category.isListed || product.category.isDeleted) return res.status(400).json({message:"This category is not available"})


        const cart = await Cart.findOne({userId})
        if(cart){
            const inCart = cart.items.some(item => item.productId.toString() === productId)
            if(inCart) return res.status(400).json({message:"Product already in cart"})
        }


        let wishlist = await Wishlist.findOne({userId})
        if(!wishlist) wishlist = new Wishlist({userId, products: []}) 
        
        let itemIndex = wishlist.products.findIndex(product => product.productId.toString() === productId)

        if(itemIndex === -1){
            wishlist.products.push({
            productId: product._id,
            price: product.price
        });

        }else{
            return res.status(400).json({message:'Product already in wishlist'})
        }

        

        await wishlist.save()

        res.status(200).json({message: "Product added to wishlist successfully",wishlist})
    } catch (error) {
        console.error('[Error in adding product to wishlist]', error)
        //res.redirect('/pageNotFound')
        res.status(500).json({ message: "Something went wrong while adding to wishlist" });
        
    }
}




const deleteFromWishlist = async(req,res) => {
    try {
        const userId = req.session.user 
        const productId = req.params.productId 
        const wishlist = await Wishlist.findOne({userId})
        if(!wishlist) return res.status(404).json({message: 'Wishlist not found'})
        wishlist.products = wishlist.products.filter(product => product.productId.toString() !== productId)
        await wishlist.save()
        res.json({message: 'Product removed from the wishlist',wishlist})
    } catch (error) {
        console.error('[Error deleting product from wishlist]',error)
        res.redirect('/pageNotFound')
        
    }
}





const getWishlistCount = async(req,res) => {
    try {
        const userId = req.session.user
        if(!userId) return res.json({count:0})
        
        const wishlist = await Wishlist.findOne({userId})
        const count = wishlist ? wishlist.products.length : 0;
        res.json({count})
    } catch (error) {
        console.error(err);
        res.json({ count: 0 });
    }
}


module.exports = {
    getWishlistPage,
    addToWishlist,
    deleteFromWishlist,
    getWishlistCount
}