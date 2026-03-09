const Student = require('../models/Student');

exports.getClassmates = async (req, res) => {
    try {
        // 1. Pehle login karne wale student ka data lo (req.user.id auth middleware se aata hai)
        const me = await Student.findById(req.user.id);
        
        if (!me) {
            return res.status(404).json({ success: false, message: "Student record not found" });
        }

        // 2. Classmates dhoondo: Same School + Same Class + NOT Me
        const classmates = await Student.find({
            schoolName: me.schoolName,
            className: me.className,
            _id: { $ne: me._id }
        }).select('username studentId isOnline lastSeen');

        // 3. Response bhej rahe hain jisme 'me' aur 'classmates' alag-alag hain
        res.status(200).json({
            success: true,
            me: {
                username: me.username,
                schoolName: me.schoolName,
                className: me.className,
                studentId: me.studentId
            },
            classmates: classmates
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};