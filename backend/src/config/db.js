import mongoose from 'mongoose';
import dns from 'dns';
import { config } from './env.js';
import { User } from '../modules/users/user.model.js';

// Configure public DNS servers (Google + Cloudflare) to prevent querySrv ETIMEOUT on campus/ISP networks
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (dnsErr) {
  // Ignore fallback if platform restricts dns.setServers
}

// Disable query buffering so unhandled DB disconnections fail fast with meaningful errors
mongoose.set('bufferCommands', false);

// Auto-seed default test seller STRICTLY in local development mode (NEVER in production)
export const ensureDefaultSeller = async (env = process.env) => {
  const currentEnv = (env.NODE_ENV || 'development').toLowerCase().trim();
  if (currentEnv !== 'development' || env.DISABLE_DEMO_SEED === 'true') {
    return { seeded: false, skipped: true, reason: `Skipped in ${currentEnv} environment` };
  }

  try {
    const existing = await User.findOne({ email: 'seller@test.com' });
    if (!existing) {
      await User.create({
        name: 'Dev Seller',
        email: 'seller@test.com',
        password: 'Password@123',
        storeName: 'AI Seller Demo Store',
        role: 'seller',
        isActive: true,
        onboardingCompleted: true,
      });
      console.log('✨ Seeded default development seller account (seller@test.com).');
      return { seeded: true, skipped: false };
    }
    return { seeded: false, skipped: false, reason: 'Already exists' };
  } catch (seedErr) {
    // Non-blocking in development
    return { seeded: false, skipped: false, error: seedErr.message };
  }
};

let retryTimer = null;

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
    });
    console.log(`🍃 MongoDB Connected: ${conn.connection.host}`);
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
    await ensureDefaultSeller();
    return conn;
  } catch (error) {
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    
    // Log helpful diagnostic instructions
    if (error.message.includes('Authentication failed') || error.message.includes('bad auth')) {
      console.error('👉 MongoDB Atlas Authentication failed: Please verify the database username and password in backend/.env under MONGODB_URI.');
    } else if (error.message.includes('querySrv') || error.message.includes('ETIMEOUT') || error.message.includes('ENOTFOUND')) {
      console.error('👉 DNS SRV / Network Timeout: Your local network or campus Wi-Fi may be blocking MongoDB SRV DNS queries or port 27017.');
      console.error('👉 Suggestion: Try connecting via your mobile hotspot or check MongoDB Atlas Network Access (0.0.0.0/0).');
    } else if (error.message.includes('whitelist') || error.message.includes('IP')) {
      console.error('👉 MongoDB Atlas IP Whitelist error: Please ensure 0.0.0.0/0 is active in MongoDB Atlas Network Access.');
    }

    // Auto-retry connection in background every 5 seconds so server auto-recovers when network connects
    if (!retryTimer) {
      retryTimer = setInterval(async () => {
        if (mongoose.connection.readyState !== 1) {
          try {
            const conn = await mongoose.connect(config.mongoUri, {
              serverSelectionTimeoutMS: 5000,
            });
            console.log(`🍃 MongoDB Reconnected successfully: ${conn.connection.host}`);
            clearInterval(retryTimer);
            retryTimer = null;
            await ensureDefaultSeller();
          } catch (retryErr) {
            // silent retry
          }
        }
      }, 5000);
    }
  }
};

