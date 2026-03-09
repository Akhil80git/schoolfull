const spamFilter = (req, res, next) => {
    const { text } = req.body;
    
    // Regex to detect 10-digit numbers or common phone formats
    const phoneRegex = /(\+?\d{1,4}[\s-]?)?(\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4,}/;

    if (text && phoneRegex.test(text)) {
        return res.status(400).json({ 
            success: false, 
            message: "Sharing contact numbers is strictly prohibited!" 
        });
    }
    next();
};

module.exports = spamFilter;