const noCache = (req, res, next) => {
    res.setHeader('Cache-Control','no-cache', 'no-store', 'must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
}



module.exports = {
    noCache
};