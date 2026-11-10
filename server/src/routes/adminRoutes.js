import { Router } from 'express';
import {
  createCategory,
  createDeal,
  createMenuItem,
  createStaffAccount,
  createTable,
  deleteMenuItem,
  getTableQrSvg,
  listAdminCatalog,
  listAllOrdersAndPayments,
  listAuditLogs,
  listStaff,
  listTables,
  regenerateTableQr,
  updateCategory,
  updateDeal,
  updateMenuItem,
  updateStaffAccount,
  updateTable,
  uploadItemImage,
} from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadMenuImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  createCategorySchema,
  createDealSchema,
  createMenuItemSchema,
  createStaffSchema,
  createTableSchema,
  idParamSchema,
  updateCategorySchema,
  updateDealSchema,
  updateMenuItemSchema,
  updateStaffSchema,
  updateTableSchema,
} from '../validators/adminValidators.js';

const router = Router();

router.use(requireAuth);

// Menu, Deals, Tables, Orders/Payments (owner & manager)
router.get('/catalog', requireRole('owner', 'manager'), listAdminCatalog);
router.post('/categories', requireRole('owner', 'manager'), validate(createCategorySchema), createCategory);
router.patch('/categories/:id', requireRole('owner', 'manager'), validate(updateCategorySchema), updateCategory);

router.post('/upload-image', requireRole('owner', 'manager'), uploadMenuImage.single('image'), uploadItemImage);
router.post('/menu-items', requireRole('owner', 'manager'), validate(createMenuItemSchema), createMenuItem);
router.patch('/menu-items/:id', requireRole('owner', 'manager'), validate(updateMenuItemSchema), updateMenuItem);
router.delete('/menu-items/:id', requireRole('owner', 'manager'), validate(idParamSchema), deleteMenuItem);

router.post('/deals', requireRole('owner', 'manager'), validate(createDealSchema), createDeal);
router.patch('/deals/:id', requireRole('owner', 'manager'), validate(updateDealSchema), updateDeal);

router.get('/tables', requireRole('owner', 'manager'), listTables);
router.post('/tables', requireRole('owner', 'manager'), validate(createTableSchema), createTable);
router.patch('/tables/:id', requireRole('owner', 'manager'), validate(updateTableSchema), updateTable);
router.post('/tables/:id/regenerate-qr', requireRole('owner', 'manager'), validate(idParamSchema), regenerateTableQr);
router.get('/tables/:id/qr.svg', requireRole('owner', 'manager'), validate(idParamSchema), getTableQrSvg);

router.get('/orders-payments', requireRole('owner', 'manager'), listAllOrdersAndPayments);

// Staff & Audit Logs (owner ONLY)
router.get('/staff', requireRole('owner'), listStaff);
router.post('/staff', requireRole('owner'), validate(createStaffSchema), createStaffAccount);
router.patch('/staff/:id', requireRole('owner'), validate(updateStaffSchema), updateStaffAccount);
router.get('/audit-logs', requireRole('owner'), listAuditLogs);

export default router;
