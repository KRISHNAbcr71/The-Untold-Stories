const userAuth = (req, res, next) => {
    if (req.session.admin) {
        // Disable cache
        res.set('Cache-Control', 'no-store');
        next();
    } else {
        res.redirect('/admin/login');
    }
};


module.exports = {
    userAuth
};