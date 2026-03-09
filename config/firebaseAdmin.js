// config/firebaseAdmin.js
// Firebase Admin SDK — server-side token verify ke liye

const admin = require('firebase-admin');

// Agar already initialized hai to wahi return karo
if (!admin.apps.length) {
    // Option 1: Service account JSON file se (recommended)
    // serviceAccountKey.json apne project root mein rakho
    // Firebase Console → Project Settings → Service Accounts → Generate New Private Key
    try {
        const serviceAccount = require('../serviceAccountKey.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin initialized with service account');
    } catch(e) {
        // Option 2: Environment variable se (production ke liye)
        // .env mein rakho: FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('✅ Firebase Admin initialized from env');
        } else {
            // Option 3: Project ID only (limited — sirf basic verify kaam karega)
            admin.initializeApp({
                projectId: process.env.FIREBASE_PROJECT_ID || 'schoolmassge'
            });
            console.log('⚠️ Firebase Admin initialized with projectId only');
        }
    }
}

module.exports = admin;