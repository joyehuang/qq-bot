import { Router } from 'express';
import authRoutes from './auth';
import checkinsRoutes from './checkins';
import usersRoutes from './users';
import statsRoutes from './stats';

const router = Router();

// 注册所有路由
router.use('/auth', authRoutes);
router.use('/checkins', checkinsRoutes);
router.use('/users', usersRoutes);
router.use('/stats', statsRoutes);

export default router;
