import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { jwt } from '@elysiajs/jwt';
import os from 'os';

import { authRoutes } from './routes/auth.js';
import { organizationRoutes } from './routes/organizations.js';
import { siteRoutes } from './routes/sites.js';
import { floorRoutes } from './routes/floors.js';
import { roomRoutes } from './routes/rooms.js';
import { fingerprintRoutes } from './routes/fingerprints.js';
import { mlRoutes } from './routes/ml.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-indoor-localization-saas-jwt-key-2026';

// Helper to get local IPv4 addresses for easy mobile testing
function getLocalIPAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ interface: name, address: net.address });
      }
    }
  }
  return addresses;
}

const app = new Elysia()
  // Global CORS enabled for cross-device mobile app connectivity
  .use(
    cors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )
  // JWT verification and signing
  .use(
    jwt({
      name: 'jwt',
      secret: JWT_SECRET,
    })
  )
  // Healthcheck & metadata endpoint
  .get('/api/health', () => {
    return {
      status: 'healthy',
      service: 'Indoor Localization SaaS API',
      timestamp: new Date().toISOString(),
      networkIPs: getLocalIPAddresses(),
    };
  })
  // Register modular domain routes
  .use(authRoutes)
  .use(organizationRoutes)
  .use(siteRoutes)
  .use(floorRoutes)
  .use(roomRoutes)
  .use(fingerprintRoutes)
  .use(mlRoutes)
  // Global error handler
  .onError(({ code, error, set }) => {
    console.error(`[Elysia Error ${code}]:`, error);
    set.status = code === 'NOT_FOUND' ? 404 : 500;
    return {
      success: false,
      error: error.message || 'Internal Server Error',
      code,
    };
  })
  // Start server listening on 0.0.0.0
  .listen({
    port: PORT,
    hostname: HOST,
  });

console.log(`\n======================================================`);
console.log(`🚀 IntraLocate SaaS Backend running with Bun + Elysia`);
console.log(`📡 Local Server URL:  http://localhost:${PORT}`);
console.log(`🌐 Listening on Host: ${HOST}:${PORT}`);
console.log(`📱 Available Network IPs for Mobile App Connection:`);
getLocalIPAddresses().forEach((ip) => {
  console.log(`   • http://${ip.address}:${PORT} (${ip.interface})`);
});
console.log(`======================================================\n`);


