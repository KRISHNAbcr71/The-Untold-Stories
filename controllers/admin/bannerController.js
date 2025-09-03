const Banner = require('../../models/bannerSchema')
const path = require('path')
const fs = require('fs')



const getBannerPage = async(req,res) => {
    try {
        const findBanner = await Banner.find({})
        if(!findBanner || findBanner.length === 0){
            return res.render('banner',{data: []})
        }
        res.render('banner',{data: findBanner})
    } catch (error) {
        console.error('[Error in banner page]',error)
        res.redirect('/pageError')
    }
}


const getAddBannerPage = async(req,res)=>{
    try {
        res.render('add-banner')
    } catch (error) {
        res.redirect('/pageError')
    }
}



// const addBanner = async(req,res)=>{
//     try {
//         const data = req.body
//         const image = req.file
//         const newBanner = new Banner({
//             image: image.filename,
//             title: data.title,
//             description: data.description,
//             startDate: new Date(data.startDate + 'T00:00:00'),
//             endDate: new Date(data.endDate + 'T00:00:00'),
//             link: data.link
//         });

//         await newBanner.save().then(data=>console.log(data));
//         res.redirect('/admin/banner')

//     } catch (error) {
//         console.error('[Error in adding banner]',error)
//         res.redirect('/admin/pageError')
        
//     }
// }
const addBanner = async (req, res) => {
  try {
    const data = req.body;
    let imageName;

    if (data.croppedImage1) {
      // decode base64
      const base64Data = data.croppedImage1.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      imageName = `banner_${Date.now()}.jpg`;
      const uploadPath = path.join("public", "uploads", "bannerImages", imageName);
      fs.writeFileSync(uploadPath, buffer);
    }

    const newBanner = new Banner({
      image: imageName,
      title: data.title,
      description: data.description,
      startDate: new Date(data.startDate + "T00:00:00"),
      endDate: new Date(data.endDate + "T00:00:00"),
      link: data.link,
    });

    await newBanner.save();
    res.redirect("/admin/banner");
  } catch (error) {
    console.error("[Error in adding banner]", error);
    res.redirect("/admin/pageError");
  }
};
module.exports = { 
    getBannerPage,
    getAddBannerPage,
    addBanner
}