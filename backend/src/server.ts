import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { initSocket } from './socket/socket';

import authRoutes from './modules/auth/auth.routes';
import menuRoutes from './modules/menu/menu.routes';
import neighborhoodsRoutes from './modules/neighborhoods/neighborhoods.routes';
import configRoutes from './modules/config/config.routes';
import ordersRoutes from './modules/orders/orders.routes';
import publicRoutes from './modules/public/public.routes';
import usersRoutes from './modules/users/users.routes';
import logsRoutes from './modules/logs/logs.routes';
import reportsRoutes from './modules/reports/reports.routes';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
initSocket(httpServer);

// Trust proxy for rate limiting (Cloud Run)
app.set('trust proxy', 1);

app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/neighborhoods', neighborhoodsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/reports', reportsRoutes);

// Serve static frontend
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// Fallback for SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use(errorHandler);

httpServer.listen(env.PORT, () => {
  console.log("Servidor rodando na porta " + env.PORT + " em ambiente " + env.NODE_ENV);
});
