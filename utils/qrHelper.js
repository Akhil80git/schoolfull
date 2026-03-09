const QRCode = require('qrcode');

const generateStudentQR = async (data) => {
    try {
        // Converting object to JSON string and then generating QR
        const jsonString = JSON.stringify(data);
        const qrImage = await QRCode.toDataURL(jsonString); // Base64 format
        return qrImage;
    } catch (err) {
        console.error('QR Generation Error:', err);
        throw new Error('Failed to generate QR');
    }
};

module.exports = { generateStudentQR };