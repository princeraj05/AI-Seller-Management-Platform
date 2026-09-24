import app from './src/app.js';
import { config } from './src/config/env.js';

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`🚀 Server running in ${config.nodeEnv} mode on http://localhost:${PORT}`);
});
