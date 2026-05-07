import { Router } from 'express';
import authRoutes from './auth';
import checkinsRoutes from './checkins';
import usersRoutes from './users';
import statsRoutes from './stats';
import aiCallsRoutes from './aiCalls';

const router = Router();

// 注册所有路由
router.use('/auth', authRoutes);
router.use('/checkins', checkinsRoutes);
router.use('/users', usersRoutes);
router.use('/stats', statsRoutes);
router.use('/ai-calls', aiCallsRoutes);

export default router;
