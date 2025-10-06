
const breadcrumb = async(req,res,next) =>{
    try {
        const pathArray = req.path.split('/').filter(Boolean)
        const breadcrumbs = pathArray.map((segment,index)=> {
            return{
                name: segment.charAt(0).toUpperCase() + segment.slice(1),
                url: '/' + pathArray.slice(0, index+1).join('/')
            }
        });

        res.locals.breadcrumbs = breadcrumbs
        next()
    } catch (error) {
        console.log("Error in breadcrumb middleware:", error);
        res.status(500).send("Internal Server Error");
    }
}

module.exports = {breadcrumb}