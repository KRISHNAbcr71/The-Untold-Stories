const User = require('../../models/userSchema')
const Product = require('../../models/productSchema')
const Cart = require('../../models/cartSchema')
const Wishlist = require('../../models/wishlistSchema')


const getCartPage = async (req, res) => {
    try {

        const userId = req.session.user
        const userData = await User.findById(userId)
        if(!userData) return res.redirect('/login')

        let cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: {
                path: "category",
                model: "Category"
            }
        });

        if (!cart) {
            cart = { items: [] }
        }

        const subtotal = cart.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0)

        res.render("cart", { cart, subtotal, user:userData })

    } catch (error) {

        console.error("[Error in loading cart page]", error)
        res.redirect('/pageNotFound')

    }
}



const addToCart = async (req, res) => {
    try {
        const userId = req.session.user
        const productId = req.params.productId

        if(!userId) return res.status(401).json({message:'Please login to continue'})

        // Check if product exists and is available
        const product = await Product.findById(productId).populate('category')

        if (!product) return res.status(404).json({ message: 'Product not found' })

        if (!product.isListed || product.isDeleted) return res.status(400).json({ message: 'This product is not available' })

        if(!product.category || !product.category.isListed || product.category.isDeleted) return res.status(400).json({message: 'This product category is not availabel'})

        // Get or create user cart
        let cart = await Cart.findOne({ userId })
        if (!cart) {
            cart = new Cart({ userId, items: [] })
        }


        // Check if product is already in cart
        //check stock / max quantity
        let itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);

        if (itemIndex > -1) {
            if (cart.items[itemIndex].quantity + 1 > product.quantity) {
                return res.status(400).json({ message: "Cannot add more than available stock" });
            }

            if(cart.items[itemIndex].quantity + 1 > 5){
                return res.status(400).json({message: "You can only add up to 5 units of this product"})
            }
            cart.items[itemIndex].quantity += 1;
            cart.items[itemIndex].totalPrice = cart.items[itemIndex].price * cart.items[itemIndex].quantity;
        } else {
            if (product.quantity < 1) {
                return res.status(400).json({ message: "Product out of stock" });
            }
            cart.items.push({
                productId: product._id,
                quantity: 1,
                price: product.price,
                totalPrice: product.price
            });
        }

        await cart.save()

        // Remove from wishlist if exists
        await Wishlist.updateOne({userId}, {$pull: {products: {productId}}})

        res.status(200).json({ message: 'Product added to cart successfully', cart })

    } catch (error) {
        console.error('[Error in adding product to cart]', error)
        res.status(500).json({ message: "Something went wrong while adding to cart" });

    }
}



const increaseQuantity = async (req, res) => {
    try {

        const userId = req.session.user; // or however you store userId
        const productId = req.params.productId;

        const cart = await Cart.findOne({ userId }).populate("items.productId")
        if (!cart) return res.status(404).json({ message: "Cart not found" });

        const item = cart.items.find(i => i.productId._id.toString() === productId);
        if (item) {

            if(item.quantity + 1 > item.productId.quantity){
                return res.status(400).json({message: "Cannot add more than available stock"})
            }

            if(item.quantity + 1 >5){
                return res.status(400).json({message: "You can only buy up to 5 units of this product"})
            }
            item.quantity += 1;
            item.totalPrice = item.quantity * item.price;
        }

        await cart.save();
        res.json({ message: "Quantity increased", cart });

    } catch (error) {
        console.error("[Error increasing quantity]", error);
        res.redirect('/pageNotFound')
    }
}




const decreaseQuantity = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.productId;

        const cart = await Cart.findOne({ userId }).populate("items.productId")
        if (!cart) return res.status(404).json({ message: "Cart not found" });

        const item = cart.items.find(i => i.productId._id.toString() === productId);
        if (item) {
            if (item.quantity > 1) {
                item.quantity -= 1;
                item.totalPrice = item.quantity * item.price;
            } 
        }

        await cart.save();
        res.json({ message: "Quantity decreased", cart });

    } catch (error) {
        console.error("[Error decreasing quantity]", error);
        res.redirect('/pageNotFound')
    }
}



const deleteFromCart = async(req,res) => {
    try {
        const userId = req.session.user
        const productId = req.params.productId

        const cart = await Cart.findOne({userId})

        if(!cart) return res.status(404).json({message: 'Cart not found'})

        cart.items = cart.items.filter(item => item.productId.toString() !== productId);

        await cart.save()
        res.json({message:'Product removed from the cart',cart})
        
    } catch (error) {
        console.error('[Error deleting product from cart]',error)
        res.redirect('/pageNotFound')
    }
}



const getCartCount = async(req,res) => {
    try {
        const userId = req.session.user
        if(!userId) return res.json({count:0})

        const cart = await Cart.findOne({userId})
        const count = cart ? cart.items.length : 0;

        res.json({count})
        
    } catch (error) {
        console.error(err);
        res.json({ count: 0 });
    }
}


module.exports = {
    getCartPage,
    addToCart,
    increaseQuantity,
    decreaseQuantity,
    deleteFromCart,
    getCartCount
}