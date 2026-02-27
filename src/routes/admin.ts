import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth.js';
import { findUsers } from '../repositories/userRepository.js';

const router = Router();

router.use(adminAuth);

router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    const result = await findUsers(page, limit);
    res.json(result);
  } catch (error) {
    console.error('Failed to list users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
