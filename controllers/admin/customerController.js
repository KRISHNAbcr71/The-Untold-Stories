const User = require('../../models/userSchema')

const customerInfo = async (req, res) => {
  try {
    let search = req.query.search || "";
    let page = parseInt(req.query.page) || 1;
    const limit = 3;

    //Fetch matching users
    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    })
      .limit(limit)  // how many results to fetch (3 per page)
      .skip((page - 1) * limit)  // skips results based on page (e.g. page 2 skips 3 users)
      .sort({ createdOn: -1 })  // most recent users first
      .exec();


      //Handle no result case
      const noResults = userData.length === 0;

    if (userData.length === 0) {
      return res.render("customers", {
        data: [],
        totalPages: 0,
        currentPage: page,
        search: search,
        noResults
      });
    }

    //Count total matching customers for pagination
    const count = await User.countDocuments({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    });
    const totalPages = Math.ceil(count / limit);

    //Render customer view with all necessary data
    res.render("customers", {
      data: userData,
      totalPages: totalPages,
      currentPage: page,
      search:search,
      noResults
    });

  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).send("Internal Server Error");
  }
};





const customerBlocked = async(req,res)=>{
  try {
    let id = req.query.id
    await User.updateOne({_id:id},{$set:{isBlocked:true}})
    res.status(200).json({ success: true });
    // res.redirect('/admin/users')
    
  } catch (error) {
    // res.redirect('/pageError')
     res.status(500).json({ success: false, error: 'Block failed' });
  }
};




const customerUnblocked = async(req,res)=>{
  try {
    let id = req.query.id
    await User.updateOne({_id:id},{$set:{isBlocked:false}})
    res.status(200).json({ success: true });
    // res.redirect('/admin/users')
    
  } catch (error) {
    // res.redirect('/pageError')
     res.status(500).json({ success: false, error: 'Unblock failed' });
  }
}

module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked
}