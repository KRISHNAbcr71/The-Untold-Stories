const User = require('../../models/userSchema')
const Category = require('../../models/categorySchema')
const { default: mongoose } = require('mongoose')


// This controller handles displaying the category management page in the admin panel.
const categoryInfo = async (req, res) => {
  try {
    let search = req.query.search || "";
    let page = parseInt(req.query.page) || 1;
    const limit = 10;

    const baseCondition = { isDeleted: { $ne: true } };

    const matchCondition = {
      ...baseCondition,
      name: { $regex: ".*" + search + ".*", $options: "i" }
    };

    const count = await Category.countDocuments(matchCondition);

    const categoryData = await Category.find(matchCondition)
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    for (let c of categoryData) {
      const index = await Category.countDocuments({
        ...baseCondition,
        _id: { $gt: c._id }
      });
      c.serialNumber = index + 1;
    }

    const totalPages = Math.ceil(count / limit);

    res.render("category", {
      cat: categoryData,
      totalPages,
      currentPage: page,
      limit,
      search,
      noResults: categoryData.length === 0
    });

  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).send("Internal Server Error");
  }
};










// This controller is used to render the "Add Category" page in the admin panel.
const loadAddCategory = async (req, res) => {
    try {
        res.render('add-category')
    } catch (error) {
        console.error("Error loading add category page:", error);
        res.status(500).send("Internal Server Error");
    }
}



// This controller handles the logic for adding a new product category to your database from the admin panel.
const addCategory = async (req, res) => {
    try {
        const { name, description } = req.body

        if (!name || name.trim() === '' || !description || description.trim() === '') {
            return res.status(400).json({ error: "All fields are required." })
        }

        const existingCategory = await Category.findOne({
            name: { $regex: `^${name}$`, $options: 'i' }
        })

        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists." })
        }

        const newCategory = new Category({ name, description })
        await newCategory.save()

        return res.json({ message: "Category added successfully." })
    } catch (error) {
        console.error("Error Saving Category:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}





const getListCategory = async (req, res) => {
    try {
        let id = req.query.id
        await Category.updateOne({ _id: id }, { $set: { isListed: true } })
        res.status(200).json({ success: true })
    } catch (error) {
        res.status(500).json({ success: false, error: 'Category listing failed' });
    }
}





const getUnlistCategory = async (req, res) => {
    try {
        let id = req.query.id
        await Category.updateOne({ _id: id }, { $set: { isListed: false } })
        res.status(200).json({ success: true })
    } catch (error) {
        res.status(500).json({ success: false, error: 'Category unlisting failed' });
    }
}







const getEditCategory = async (req, res) => {
    try {
        const { id } = req.query

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/pageError')
        }
        const category = await Category.findOne({ _id: id })

        if (!category) {
            return res.redirect('/pageError')
        }
        res.render('edit-category', { category })
    } catch (error) {
        console.error('Error in getEditCategory:', error.message);
        res.redirect('/pageError')
    }
}


const editCategory = async (req, res) => {
    try {
        const { id } = req.params
        const { name, description } = req.body

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid category ID.' });
        }

        const existingCategory = await Category.findOne({ name:  { $regex: `^${name}$`, $options: 'i' }  })

        if (existingCategory) {
            return res.status(400).json({ success: false, message: "Category with the same name already exists." });
        }

        const updateCategory = await Category.findByIdAndUpdate(id, { name, description }, { new: true })

        if (!updateCategory) {
            return res.status(404).json({ success: false, message: "Category not found." });
        }

        return res.status(200).json({ success: true, message: "Category updated successfully." });
        
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}




const deleteCategory = async(req,res)=>{
    try {
        const {id} = req.params 
        const category = await Category.findByIdAndUpdate(id,{isDeleted:true},{new:true})
        
        if(!category){
            return res.status(404).json({success:false, message:'Category not found'})
        }

        return res.status(200).json({success:true, message:'Category soft deleted successfully.'})

    } catch (error) {
        console.error("Error in soft delete:", error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}





const trashCategory = async(req,res)=>{
    try {
        let search = req.query.search || ''
        let page = parseInt(req.query.page) || 1
        let limit = 3

        const deletedCategories = await Category.find({
            name:{$regex: ".*" + search + ".*", $options: "i"},
            isDeleted:true
        })
        .limit(limit)
        .skip((page-1)*limit)
        .sort({deletedAt:-1})


        const count = await Category.countDocuments({
            name:{$regex: ".*" + search + ".*", $options: "i"},
            isDeleted:true
        })

        res.render('trash-category',{
            cat: deletedCategories,
            totalPages: Math.ceil(count/limit),
            currentPage: page,
            search,
            noResults: deletedCategories.length === 0
        })
    } catch (error) {
        console.error("Error loading trash:", error);
        res.status(500).send("Internal Server Error");
    }
}




const restoreCategory = async(req,res)=>{
    try {
        const {id} = req.params
        const category = await Category.findByIdAndUpdate(id,{isDeleted:false},{new:true})
        if (!category) {
            return res.status(404).json({success:false, message:'Category not found'})
        }
        return res.status(200).json({ success: true, message: 'Category restored successfully.' });

    } catch (error) {
        console.error("Error restoring category:", error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}


module.exports = {
    categoryInfo,
    loadAddCategory,
    addCategory,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory,
    deleteCategory,
    trashCategory,
    restoreCategory
}