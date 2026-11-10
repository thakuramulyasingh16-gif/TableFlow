import { Router } from 'express';
import {
  confirmOrder,
  getFloorMap,
  listPendingWaiterCalls,
  listStaffOrders,
  markOrderServed,
  resolveWaiterCall,
  updateTableStatus,
} from '../controllers/staffController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { callIdParamSchema, orderIdParamSchema, tableStatusSchema } from '../validators/staffValidators.js';

const router = Router();

router.use(requireAuth, requireRole('waiter', 'manager', 'owner'));

router.get('/floor', getFloorMap);
router.get('/orders', listStaffOrders);
router.post('/orders/:orderId/confirm', validate(orderIdParamSchema), confirmOrder);
router.post('/orders/:orderId/serve', validate(orderIdParamSchema), markOrderServed);
router.get('/waiter-calls', listPendingWaiterCalls);
router.post('/waiter-calls/:callId/resolve', validate(callIdParamSchema), resolveWaiterCall);
router.patch('/tables/:tableId/status', validate(tableStatusSchema), updateTableStatus);

export default router;
