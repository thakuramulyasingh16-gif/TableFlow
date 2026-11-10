import { Router } from 'express';
import { getKitchenQueue, updateKitchenItemStatus } from '../controllers/kitchenController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateKitchenItemStatusSchema } from '../validators/kitchenValidators.js';

const router = Router();

router.use(requireAuth, requireRole('chef', 'manager', 'owner'));

router.get('/queue', getKitchenQueue);
router.patch('/order-items/:itemId/status', validate(updateKitchenItemStatusSchema), updateKitchenItemStatus);

export default router;
