const { body } = require('express-validator');

exports.validateRegistration = [
    body('username').isString().notEmpty(),
    body('studentId').isLength({ min: 4 }),
    body('schoolName').notEmpty(),
    body('className').notEmpty()
];