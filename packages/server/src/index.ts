import 'dotenv/config';
import { createServer } from './server.js';
import { initializeDatabase } from './db/index.js';
import { initializeAuth } from './auth/index.js';

const PORT = parseInt(process.env.PORT || '5002', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATABASE_PATH = process.env.DATABASE_PATH || './data/openfacilitator.db';

async function main() {
  // Initialize database
  initializeDatabase(DATABASE_PATH);

  // Initialize auth
  initializeAuth(DATABASE_PATH);

  // Create and start server
  const app = createServer();

  app.listen(PORT, HOST, () => {
    console.log(`🚀 OpenFacilitator server running at http://${HOST}:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Database: ${DATABASE_PATH}`);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export { createServer } from './server.js';
export * from './db/index.js';
export * from './auth/index.js';

