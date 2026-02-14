const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const Razorpay = require("razorpay");
const crypto = require("crypto");

// Initialize Razorpay
const razorpayInstance = new Razorpay({
  key_id: process.env.KEY_ID,
  key_secret: process.env.KEY_SECRET,
});


const getWallet = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");
    const userData = await User.findById(userId);
    const currentPage = Math.max(1, parseInt(req.query.page) || 1)
    const limit = 5

    const allTransactions = userData.wallet.transactions
      .sort((a, b) => b.createdAt - a.createdAt)

    const totalTransactions = allTransactions.length
    const totalPages = Math.ceil(totalTransactions/limit)  

    const startIndex = (currentPage - 1) * limit
    const endIndex = startIndex + limit

    const transactions = allTransactions.slice(startIndex,endIndex)

    res.render("wallet", {
      user: userData,
      transactions,
      razorpayKeyId: process.env.KEY_ID,
      currentPage,
      totalPages
    });
  } catch (error) {
    console.error("[Error in loading wallet page]", error);
    res.redirect("/pageNotFound");
  }
};





// Create Add Money Order
const createAddMoneyOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { amount } = req.body;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not logged in" 
      });
    }
    
    const addAmount = parseFloat(amount);
    if (!addAmount || isNaN(addAmount) || addAmount < 10 || addAmount > 10000) {
      return res.status(400).json({
        success: false,
        message: "Amount must be between ₹10 and ₹10,000"
      });
    }
    
    const razorpayOrder = await razorpayInstance.orders.create({
      amount: addAmount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        userId: userId.toString(),
        purpose: "wallet_add_money"
      }
    });
    

    await User.findByIdAndUpdate(userId, {
      $push: {
        'wallet.transactions': {
          type: 'credit',
          amount: addAmount,
          description: `Add money to wallet - Pending`,
          status: 'pending',
          razorpayOrderId: razorpayOrder.id,
          createdAt: new Date()
        }
      }
    });
    
    res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.KEY_ID
    });
    
  } catch (error) {
    console.error("Error creating add money order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment order"
    });
  }
};


// Verify Add Money Payment
const verifyAddMoneyPayment = async (req, res) => {
  try {
    const userId = req.session.user;
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    } = req.body;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not logged in" 
      });
    }
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.KEY_SECRET)
      .update(body.toString())
      .digest("hex");
    
    const isSignatureValid = expectedSignature === razorpay_signature;
    
    if (!isSignatureValid) {

      await User.findOneAndUpdate(
        {
          _id: userId,
          'wallet.transactions.razorpayOrderId': razorpay_order_id
        },
        {
          $set: {
            'wallet.transactions.$.status': 'failed',
            'wallet.transactions.$.description': 'Add money - Payment verification failed'
          }
        }
      );
      
      return res.status(400).json({
        success: false,
        message: "Payment verification failed"
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const transactionIndex = user.wallet.transactions.findIndex(
      t => t.razorpayOrderId === razorpay_order_id && t.status === 'pending'
    );
    
    if (transactionIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }
    
    const transaction = user.wallet.transactions[transactionIndex];
    const amountToAdd = transaction.amount;
    
    user.wallet.balance += amountToAdd;
    user.wallet.transactions[transactionIndex].status = 'completed';
    user.wallet.transactions[transactionIndex].description = `Added ₹${amountToAdd} to wallet`;
    user.wallet.transactions[transactionIndex].razorpayPaymentId = razorpay_payment_id;
    
    await user.save();
    
    res.json({
      success: true,
      message: `₹${amountToAdd} added to wallet successfully`,
      newBalance: user.wallet.balance
    });
    
  } catch (error) {
    console.error("Error verifying add money payment:", error);
    res.status(500).json({
      success: false,
      message: "Payment verification failed"
    });
  }
};


const withdrawMoney = async (req, res) => {
  try {
    const userId = req.session.user;
    const { amount } = req.body;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not logged in" 
      });
    }
    
    const withdrawAmount = parseFloat(amount);
    const minWithdrawal = 100;
    
    if (!withdrawAmount || isNaN(withdrawAmount) || withdrawAmount < minWithdrawal) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is ₹${minWithdrawal}`
      });
    }
    
    const user = await User.findById(userId);
    
    if (!user.wallet) {
      user.wallet = { balance: 0, transactions: [] };
    }
    
    if (user.wallet.balance < withdrawAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance"
      });
    }
    
    user.wallet.balance -= withdrawAmount;
    
    user.wallet.transactions.push({
      type: 'debit',
      amount: withdrawAmount,
      description: `Wallet Withdrawal`,
      status: 'completed',
      createdAt: new Date()
    });
    
    await user.save();
    
    res.json({
      success: true,
      message: `₹${withdrawAmount} withdrawn successfully from your wallet.`,
      newBalance: user.wallet.balance
    });
    
  } catch (error) {
    console.error("Error processing withdrawal:", error);
    res.status(500).json({
      success: false,
      message: "Withdrawal request failed"
    });
  }
};

// Handle payment failed
const paymentFailed = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId, razorpayOrderId } = req.body;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not logged in" 
      });
    }
    
    console.log('Processing payment failed for order:', orderId);
    
    const user = await User.findById(userId);
    
    if (user && user.wallet && user.wallet.transactions) {
      const transactionIndex = user.wallet.transactions.findIndex(
        t => (t.razorpayOrderId === razorpayOrderId || t._id.toString() === orderId) && t.status === 'pending'
      );
      
      if (transactionIndex !== -1) {
        user.wallet.transactions[transactionIndex].status = 'failed';
        user.wallet.transactions[transactionIndex].description = 'Add money - Payment failed';
        
        await user.save();
        console.log('Transaction marked as failed');
      }
    }
    
    res.json({
      success: true,
      message: "Payment status updated"
    });
    
  } catch (error) {
    console.error("Error updating payment failed status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update payment status"
    });
  }
};




// Add to your wallet controller file
const useWalletForPayment = async (req, res) => {
  try {
    const userId = req.session.user;
    const { amount, orderId } = req.body;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not logged in" 
      });
    }
    
    const paymentAmount = parseFloat(amount);
    if (!paymentAmount || isNaN(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount"
      });
    }
    
    const user = await User.findById(userId);
    
    if (!user.wallet || user.wallet.balance < paymentAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance"
      });
    }
    
    user.wallet.balance -= paymentAmount;
    
    user.wallet.transactions.push({
      type: 'debit',
      amount: paymentAmount,
      description: `Payment for order`,
      orderId: orderId,
      status: 'completed',
      createdAt: new Date()
    });
    
    await user.save();
    
    res.json({
      success: true,
      message: `₹${paymentAmount} paid from wallet successfully`,
      newBalance: user.wallet.balance
    });
    
  } catch (error) {
    console.error("Error processing wallet payment:", error);
    res.status(500).json({
      success: false,
      message: "Wallet payment failed"
    });
  }
};


module.exports = {
  getWallet,
  createAddMoneyOrder,
  verifyAddMoneyPayment,
  withdrawMoney,
  paymentFailed,
  useWalletForPayment
};
