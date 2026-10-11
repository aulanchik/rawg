import { Router } from 'express';
import { getSample } from '@/controllers/sampleController';

const router = Router();

router.get('/', getSample);

export default router;
