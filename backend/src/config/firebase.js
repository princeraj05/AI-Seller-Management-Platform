import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseAdminApp = null;

try {
  const jsonPath = path.resolve(__dirname, '../../', config.firebase.serviceAccountPath || '../ai-seller-management-platform-firebase-adminsdk-fbsvc-96293ddcb9.json');
  
  if (existsSync(jsonPath)) {
    const serviceAccount = JSON.parse(readFileSync(jsonPath, 'utf8'));
    firebaseAdminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: config.firebase.projectId,
    });
    console.log('🔥 Firebase Admin SDK initialized successfully.');
  } else {
    console.warn(`⚠️ Firebase service account file not found at: ${jsonPath}`);
  }
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error.message);
}

export const adminAuth = firebaseAdminApp ? admin.auth() : null;
export default firebaseAdminApp;
