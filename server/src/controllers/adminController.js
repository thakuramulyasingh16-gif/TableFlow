import bcrypt from 'bcryptjs';
import { getModels } from '../db/models/index.js';
import { saveValidatedImage } from '../middleware/upload.js';
import { recordAuditLog } from '../services/auditService.js';
import { generateTableQrAssets } from '../services/qrService.js';
import { AppError } from '../utils/AppError.js';
import { generateOpaqueToken } from '../utils/crypto.js';
import { sanitizeUserText } from '../utils/sanitize.js';

const BCRYPT_COST = 12;

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --- Categories & Stations ---
export async function listAdminCatalog(_req, res, next) {
  try {
    const { Category, KitchenStation, MenuItem, ItemVariant, Deal } = getModels();
    const [categories, stations, items, deals] = await Promise.all([
      Category.findAll({ order: [['sort_order', 'ASC'], ['name', 'ASC']] }),
      KitchenStation.findAll({ order: [['display_order', 'ASC']] }),
      MenuItem.findAll({
        include: [
          { model: ItemVariant, as: 'variants' },
          { model: Category, as: 'category', attributes: ['id', 'name'] },
          { model: KitchenStation, as: 'station', attributes: ['id', 'name', 'code'] },
        ],
        order: [['id', 'ASC']],
      }),
      Deal.findAll({ order: [['id', 'DESC']] }),
    ]);
    res.json({ categories, stations, items, deals });
  } catch (err) {
    next(err);
  }
}

export async function createCategory(req, res, next) {
  try {
    const { Category } = getModels();
    const slug = req.body.slug || toSlug(req.body.name);
    const category = await Category.create({
      name: sanitizeUserText(req.body.name, 80),
      slug,
      description: req.body.description ? sanitizeUserText(req.body.description, 255) : null,
      sort_order: req.body.sortOrder ?? 0,
      is_active: req.body.isActive ?? true,
    });
    await recordAuditLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'CATEGORY_CREATED',
      entityType: 'category',
      entityId: category.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
}

export async function updateCategory(req, res, next) {
  try {
    const { Category } = getModels();
    const category = await Category.findByPk(req.params.id);
    if (!category) throw new AppError(404, 'Category not found.', 'NOT_FOUND');

    const patch = {};
    if (req.body.name !== undefined) patch.name = sanitizeUserText(req.body.name, 80);
    if (req.body.slug !== undefined) patch.slug = req.body.slug;
    if (req.body.description !== undefined) patch.description = sanitizeUserText(req.body.description, 255);
    if (req.body.sortOrder !== undefined) patch.sort_order = req.body.sortOrder;
    if (req.body.isActive !== undefined) patch.is_active = req.body.isActive;

    await category.update(patch);
    res.json({ category });
  } catch (err) {
    next(err);
  }
}

// --- Menu Items & Safe Image Upload ---
export async function uploadItemImage(req, res, next) {
  try {
    const saved = await saveValidatedImage(req.file);
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
}

export async function createMenuItem(req, res, next) {
  try {
    const { MenuItem, ItemVariant, sequelize } = getModels();
    const item = await sequelize.transaction(async (transaction) => {
      const created = await MenuItem.create(
        {
          category_id: req.body.categoryId,
          station_id: req.body.stationId,
          name: sanitizeUserText(req.body.name, 120),
          description: req.body.description ? sanitizeUserText(req.body.description, 1000) : null,
          image_url: req.body.imageUrl || null,
          base_price_paise: req.body.basePricePaise,
          is_veg: req.body.isVeg,
          spice_level: req.body.spiceLevel || 'mild',
          allergens: req.body.allergens || [],
          is_available: req.body.isAvailable ?? true,
          prep_time_mins: req.body.prepTimeMins ?? 15,
        },
        { transaction }
      );

      if (req.body.variants?.length) {
        await ItemVariant.bulkCreate(
          req.body.variants.map((v) => ({
            menu_item_id: created.id,
            name: sanitizeUserText(v.name, 60),
            price_delta_paise: v.priceDeltaPaise,
            is_default: v.isDefault ?? false,
            is_available: true,
          })),
          { transaction }
        );
      }
      return MenuItem.findByPk(created.id, {
        include: [{ model: ItemVariant, as: 'variants' }],
        transaction,
      });
    });

    await recordAuditLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'MENU_ITEM_CREATED',
      entityType: 'menu_item',
      entityId: item.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { name: item.name, basePricePaise: item.base_price_paise },
    });

    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

export async function updateMenuItem(req, res, next) {
  try {
    const { MenuItem, ItemVariant } = getModels();
    const item = await MenuItem.findByPk(req.params.id);
    if (!item) throw new AppError(404, 'Menu item not found.', 'NOT_FOUND');

    const prevPrice = item.base_price_paise;
    const patch = {};
    if (req.body.categoryId !== undefined) patch.category_id = req.body.categoryId;
    if (req.body.stationId !== undefined) patch.station_id = req.body.stationId;
    if (req.body.name !== undefined) patch.name = sanitizeUserText(req.body.name, 120);
    if (req.body.description !== undefined) patch.description = sanitizeUserText(req.body.description, 1000);
    if (req.body.imageUrl !== undefined) patch.image_url = req.body.imageUrl;
    if (req.body.basePricePaise !== undefined) patch.base_price_paise = req.body.basePricePaise;
    if (req.body.isVeg !== undefined) patch.is_veg = req.body.isVeg;
    if (req.body.spiceLevel !== undefined) patch.spice_level = req.body.spiceLevel;
    if (req.body.allergens !== undefined) patch.allergens = req.body.allergens;
    if (req.body.isAvailable !== undefined) patch.is_available = req.body.isAvailable;
    if (req.body.prepTimeMins !== undefined) patch.prep_time_mins = req.body.prepTimeMins;

    await item.update(patch);

    await recordAuditLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: patch.base_price_paise !== undefined && patch.base_price_paise !== prevPrice ? 'PRICE_CHANGED' : 'MENU_ITEM_UPDATED',
      entityType: 'menu_item',
      entityId: item.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { prevPrice, newPrice: item.base_price_paise, isAvailable: item.is_available },
    });

    const refreshed = await MenuItem.findByPk(item.id, { include: [{ model: ItemVariant, as: 'variants' }] });
    res.json({ item: refreshed });
  } catch (err) {
    next(err);
  }
}

export async function deleteMenuItem(req, res, next) {
  try {
    const { MenuItem, OrderItem } = getModels();
    const item = await MenuItem.findByPk(req.params.id);
    if (!item) throw new AppError(404, 'Menu item not found.', 'NOT_FOUND');

    const usedCount = await OrderItem.count({ where: { menu_item_id: item.id } });
    if (usedCount > 0) {
      await item.update({ is_available: false });
      return res.json({ deactivated: true, message: 'Item has historical orders; marked unavailable.' });
    }

    await item.destroy();
    return res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

// --- Deals ---
export async function createDeal(req, res, next) {
  try {
    const { Deal } = getModels();
    const deal = await Deal.create({
      title: sanitizeUserText(req.body.title, 120),
      description: req.body.description ? sanitizeUserText(req.body.description, 255) : null,
      code: req.body.code ? req.body.code.toUpperCase() : null,
      discount_type: req.body.discountType,
      discount_value: req.body.discountValue,
      min_order_paise: req.body.minOrderPaise ?? 0,
      applicable_category_id: req.body.applicableCategoryId ?? null,
      starts_at: req.body.startsAt ? new Date(req.body.startsAt) : null,
      ends_at: req.body.endsAt ? new Date(req.body.endsAt) : null,
      is_active: req.body.isActive ?? true,
    });
    res.status(201).json({ deal });
  } catch (err) {
    next(err);
  }
}

export async function updateDeal(req, res, next) {
  try {
    const { Deal } = getModels();
    const deal = await Deal.findByPk(req.params.id);
    if (!deal) throw new AppError(404, 'Deal not found.', 'NOT_FOUND');

    const patch = {};
    if (req.body.title !== undefined) patch.title = sanitizeUserText(req.body.title, 120);
    if (req.body.description !== undefined) patch.description = sanitizeUserText(req.body.description, 255);
    if (req.body.code !== undefined) patch.code = req.body.code ? req.body.code.toUpperCase() : null;
    if (req.body.discountType !== undefined) patch.discount_type = req.body.discountType;
    if (req.body.discountValue !== undefined) patch.discount_value = req.body.discountValue;
    if (req.body.minOrderPaise !== undefined) patch.min_order_paise = req.body.minOrderPaise;
    if (req.body.isActive !== undefined) patch.is_active = req.body.isActive;

    await deal.update(patch);
    res.json({ deal });
  } catch (err) {
    next(err);
  }
}

// --- Tables & Printable QR Codes ---
export async function listTables(_req, res, next) {
  try {
    const { Table } = getModels();
    const tables = await Table.findAll({ order: [['id', 'ASC']] });
    const withQr = await Promise.all(
      tables.map(async (t) => {
        const qr = await generateTableQrAssets(t.qr_token);
        return {
          id: t.id,
          tableNumber: t.table_number,
          label: t.label,
          capacity: t.capacity,
          zone: t.zone,
          status: t.status,
          isActive: t.is_active,
          qrToken: t.qr_token,
          qrUrl: qr.url,
          qrDataUrl: qr.dataUrl,
        };
      })
    );
    res.json({ tables: withQr });
  } catch (err) {
    next(err);
  }
}

export async function createTable(req, res, next) {
  try {
    const { Table } = getModels();
    const table = await Table.create({
      table_number: sanitizeUserText(req.body.tableNumber, 20),
      label: sanitizeUserText(req.body.label, 80),
      capacity: req.body.capacity ?? 4,
      zone: req.body.zone ? sanitizeUserText(req.body.zone, 60) : 'Main Hall',
      qr_token: generateOpaqueToken(32),
      status: 'free',
      is_active: true,
    });
    const qr = await generateTableQrAssets(table.qr_token);
    res.status(201).json({ table, qr });
  } catch (err) {
    next(err);
  }
}

export async function updateTable(req, res, next) {
  try {
    const { Table } = getModels();
    const table = await Table.findByPk(req.params.id);
    if (!table) throw new AppError(404, 'Table not found.', 'NOT_FOUND');

    const patch = {};
    if (req.body.label !== undefined) patch.label = sanitizeUserText(req.body.label, 80);
    if (req.body.capacity !== undefined) patch.capacity = req.body.capacity;
    if (req.body.zone !== undefined) patch.zone = sanitizeUserText(req.body.zone, 60);
    if (req.body.isActive !== undefined) patch.is_active = req.body.isActive;

    await table.update(patch);
    res.json({ table });
  } catch (err) {
    next(err);
  }
}

export async function regenerateTableQr(req, res, next) {
  try {
    const { Table, TableSession, sequelize } = getModels();
    const table = await Table.findByPk(req.params.id);
    if (!table) throw new AppError(404, 'Table not found.', 'NOT_FOUND');

    const nextToken = generateOpaqueToken(32);
    await sequelize.transaction(async (transaction) => {
      await table.update({ qr_token: nextToken }, { transaction });
      await TableSession.update(
        { status: 'expired', closed_at: new Date() },
        { where: { table_id: table.id, status: 'active' }, transaction }
      );
      await recordAuditLog({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'TABLE_QR_REGENERATED',
        entityType: 'table',
        entityId: table.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        metadata: { tableNumber: table.table_number },
        transaction,
      });
    });

    const qr = await generateTableQrAssets(nextToken);
    res.json({ tableId: table.id, qrToken: nextToken, ...qr });
  } catch (err) {
    next(err);
  }
}

export async function getTableQrSvg(req, res, next) {
  try {
    const { Table } = getModels();
    const table = await Table.findByPk(req.params.id);
    if (!table) throw new AppError(404, 'Table not found.', 'NOT_FOUND');

    const qr = await generateTableQrAssets(table.qr_token);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="table-${table.table_number}-qr.svg"`);
    res.send(qr.svg);
  } catch (err) {
    next(err);
  }
}

// --- Staff Management (Owner only) ---
export async function listStaff(_req, res, next) {
  try {
    const { User, Role } = getModels();
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'is_active', 'locked_until', 'created_at'],
      include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
      order: [['id', 'ASC']],
    });
    res.json({ staff: users });
  } catch (err) {
    next(err);
  }
}

export async function createStaffAccount(req, res, next) {
  try {
    const { User, Role } = getModels();
    const role = await Role.findOne({ where: { name: req.body.role } });
    if (!role) throw new AppError(400, 'Invalid role specified.', 'INVALID_ROLE');

    const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_COST);
    const user = await User.create({
      name: sanitizeUserText(req.body.name, 120),
      email: req.body.email.toLowerCase(),
      password_hash: passwordHash,
      role_id: role.id,
      is_active: true,
    });

    await recordAuditLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'STAFF_CREATED',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { role: role.name, email: user.email },
    });

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: role.name, is_active: user.is_active },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateStaffAccount(req, res, next) {
  try {
    const { User, Role } = getModels();
    const target = await User.findByPk(req.params.id, { include: [{ model: Role, as: 'role' }] });
    if (!target) throw new AppError(404, 'Staff user not found.', 'USER_NOT_FOUND');

    if (target.id === req.user.id && req.body.isActive === false) {
      throw new AppError(400, 'You cannot deactivate your own owner account.', 'SELF_DEACTIVATE_BLOCKED');
    }

    const patch = {};
    let roleChanged = false;
    if (req.body.role !== undefined && req.body.role !== target.role.name) {
      const nextRole = await Role.findOne({ where: { name: req.body.role } });
      if (!nextRole) throw new AppError(400, 'Invalid role.', 'INVALID_ROLE');
      patch.role_id = nextRole.id;
      patch.token_version = target.token_version + 1;
      roleChanged = true;
    }
    if (req.body.isActive !== undefined) {
      patch.is_active = req.body.isActive;
      if (!req.body.isActive) {
        patch.token_version = target.token_version + 1;
      }
    }

    await target.update(patch);

    await recordAuditLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: roleChanged ? 'STAFF_ROLE_CHANGED' : 'STAFF_UPDATED',
      entityType: 'user',
      entityId: target.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: req.body,
    });

    res.json({ updated: true });
  } catch (err) {
    next(err);
  }
}

// --- Orders, Payments & Audit Logs ---
export async function listAllOrdersAndPayments(_req, res, next) {
  try {
    const { Order, OrderItem, Table, Payment } = getModels();
    const [orders, payments] = await Promise.all([
      Order.findAll({
        include: [
          { model: Table, as: 'table', attributes: ['id', 'table_number', 'label'] },
          { model: OrderItem, as: 'items' },
        ],
        order: [['created_at', 'DESC']],
        limit: 100,
      }),
      Payment.findAll({
        order: [['created_at', 'DESC']],
        limit: 100,
      }),
    ]);
    res.json({ orders, payments });
  } catch (err) {
    next(err);
  }
}

export async function listAuditLogs(_req, res, next) {
  try {
    const { AuditLog } = getModels();
    const logs = await AuditLog.findAll({
      order: [['created_at', 'DESC']],
      limit: 100,
    });
    res.json({ logs });
  } catch (err) {
    next(err);
  }
}
