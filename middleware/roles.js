exports.verifyAdmin = (req, res, next) => {
    // Simple check: In production, check role from DB
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: "Forbidden: Admins only" });
    }
};