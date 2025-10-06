const User = require('../../models/userSchema')
const Address = require('../../models/addressSchema')
const mongoose = require('mongoose')

const getAddressPage = async (req, res) => {
    try {
        const userId = req.session.user
        const userData = await User.findById(userId)
        const addressData = await Address.findOne({ userId: userId })
        res.render('address', { user: userData, userAddress: addressData })
    } catch (error) {
        console.error('[Error in loading address page]', error)
        res.redirect('/pageNotFound')

    }
}



const addAddress = async (req, res) => {
    try {
        const userId = req.session.user
        const userData = await User.findById(userId)
        res.render('add-address', { user: userData })

    } catch (error) {
        console.error('[Error in loading add address page]', error)
        res.redirect('/pageNotFound')

    }
}




const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user
        const userData = await User.findOne({ _id: userId })
        // const { addressType, name, landmark, state, pincode, fullAddress, phone, altPhone } = req.body
        const { name, landmark, state, pincode, fullAddress, phone, altPhone } = req.body
        let userAddress = await Address.findOne({ userId: userData._id })
        if (!userAddress) {
            const newAddress = new Address({
                userId: userData._id,
                // address: [{ addressType, name, landmark, state, pincode, fullAddress, phone, altPhone }]
                address: [{ name, landmark, state, pincode, fullAddress, phone, altPhone }]
            });
            await newAddress.save();
        } else {
            // userAddress.address.push({ addressType, name, landmark, state, pincode, fullAddress, phone, altPhone });
            userAddress.address.push({ name, landmark, state, pincode, fullAddress, phone, altPhone });
            await userAddress.save();
        }
        res.json({ message: 'Address added successfully' })
    } catch (error) {
        console.error('[Error in adding address]', error)
        res.redirect('/pageNotFound')

    }
}





const getEditAddressPage = async (req, res) => {
    try {

        const addressId = req.query.id
        const userId = req.session.user
        const userData = await User.findOne({_id: userId})
        // console.log("edit page user session",user);
        
        const userAddresses = await Address.findOne({ "address._id": addressId })
        if (!userAddresses) return res.redirect('/pageNotFound')
        const addressData = await userAddresses.address.find((item) => {
            return item._id.toString() === addressId.toString()
        });
        if (!addressData) return res.redirect('/pageNotFound')
        res.render('edit-address', { address: addressData, user: userData })

    } catch (error) {
        console.error('[Error in loading edit address page]', error)
        res.redirect('/pageNotFound')

    }
}




const editAddress = async (req, res) => {
    try {
        const data = req.body
        const {addressId} = req.params
        const userId = req.session.user
        const userData = await User.findOne({_id:userId})


        console.log("UserId from session:", userData._id)
        console.log("AddressId from params:", addressId)
        
        

        const findAddress = await Address.findOne({
            userId: userData._id, 
            "address._id": new mongoose .Types.ObjectId(addressId) 
        });
        console.log('Find Address: ',findAddress)

        if (!findAddress) 
            return res.status(404).json({success:false, message: 'Address not found'})

        await Address.updateOne(
            { userId: userData._id, "address._id": new mongoose.Types.ObjectId(addressId)},
            {
                $set: {
                    // "address.$.addressType": data.addressType,
                    "address.$.name": data.name,
                    "address.$.landmark": data.landmark,
                    "address.$.state": data.state,
                    "address.$.pincode": data.pincode,
                    "address.$.fullAddress": data.fullAddress,
                    "address.$.phone": data.phone,
                    "address.$.altPhone": data.altPhone,
                }
            }
        )

        res.json({success:true,  message: 'Address updated successfully'});

    } catch (error) {
        console.error('[Error in edit address]', error)
        // res.redirect('/pageNotFound')
        res.status(500).json({success:false, message: 'Something went wrong'})
    }
}





const deleteAddress = async(req,res) => {
    try {
        const {addressId} = req.params
        const userId = req.session.user
        
        const userData = await User.findOne({_id:userId});
        if(!userData) 
            return res.status(401).json({success:false, message:'User not found'})

        const findAddress = await Address.findOne({
            userId: userData._id,
            "address._id": new mongoose.Types.ObjectId(addressId) 
        });

        if(!findAddress)
            return res.status(404).json({success:false, message:'Address not found'})

        await Address.updateOne(
            { userId: userData._id},
            {
                $pull: {
                    address: {
                        _id: new mongoose.Types.ObjectId(addressId) 
                    }
                }
            }
        )

        res.json({success:true, message:'Address deleted successfully'})
        
    } catch (error) {
        console.error('[Error in deleting address]',error)
        res.status(500).json({success:false, message: 'Something went wrong'})
        
    }
}





module.exports = {
    getAddressPage,
    addAddress,
    postAddAddress,
    getEditAddressPage,
    editAddress,
    deleteAddress
}