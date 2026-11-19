import app from './src/app.js';
import { config } from './src/config/env.js';
import { connectDB } from './src/config/db.js';

const PORT = config.port;

// Connect to MongoDB
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running in ${config.nodeEnv} mode on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize MongoDB connection:', err);
  app.listen(PORT, () => {
    console.log(`⚠️ Server running with DB warnings on http://localhost:${PORT}`);
  });
});
