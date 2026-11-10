import { Op } from 'sequelize';
import { getModels } from '../db/models/index.js';
import { recordAuditLog } from '../services/auditService.js';
import { AppError } from '../utils/AppError.js';

export async function getFloorMap(_req, res, next) {
  try {
    const { Table, Order, WaiterCall } = getModels();
    const tables = await Table.findAll({
      where: { is_active: true },
      attributes: ['id', 'table_number', 'label', 'capacity', 'zone', 'status'],
      order: [['id', 'ASC']],
    });

    const [activeOrders, pendingCalls] = await Promise.all([
      Order.findAll({
        where: { status: { [Op.in]: ['received', 'confirmed', 'preparing', 'ready'] } },
        attributes: ['id', 'table_id', 'status'],
      }),
      WaiterCall.findAll({
        where: { status: 'pending' },
        attributes: ['id', 'table_id', 'reason', 'created_at'],
      }),
    ]);

    const floor = tables.map((t) => ({
      id: t.id,
      tableNumber: t.table_number,
      label: t.label,
      capacity: t.capacity,
      zone: t.zone,
      status: t.status,
      activeOrderCount: activeOrders.filter((o) => o.table_id === t.id).length,
      pendingCalls: pendingCalls.filter((c) => c.table_id === t.id),
    }));

    res.json({ tables: floor });
  } catch (err) {
    next(err);
  }
}

export async function listStaffOrders(_req, res, next) {
  try {
    const { Order, OrderItem, Table, KitchenStation } = getModels();
    const orders = await Order.findAll({
      where: { status: { [Op.in]: ['received', 'confirmed', 'preparing', 'ready'] } },
      include: [
        { model: Table, as: 'table', attributes: ['id', 'table_number', 'label', 'zone'] },
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: KitchenStation, as: 'station', attributes: ['id', 'name', 'code'] }],
        },
      ],
      order: [['created_at', 'ASC']],
    });
    res.json({ orders });
  } catch (err) {
    next(err);
  }
}

export async function confirmOrder(req, res, next) {
  try {
    const { Order, OrderItem, Table, KitchenStation } = getModels();
    const order = await Order.findByPk(req.params.orderId, {
      include: [
        { model: Table, as: 'table', attributes: ['id', 'table_number', 'label', 'zone'] },
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: KitchenStation, as: 'station', attributes: ['id', 'name', 'code'] }],
        },
      ],
    });

    if (!order) {
      throw new AppError(404, 'Order not found.', 'ORDER_NOT_FOUND');
    }
    if (order.status !== 'received') {
      throw new AppError(409, `Order cannot be confirmed from status "${order.status}".`, 'INVALID_ORDER_STATE');
    }

    await order.update({
      status: 'confirmed',
      confirmed_by: req.user.id,
      confirmed_at: new Date(),
    });

    await recordAuditLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'ORDER_CONFIRMED',
      entityType: 'order',
      entityId: order.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { orderNumber: order.order_number },
    });

    const io = req.app.get('io');
    if (io) {
      io.to('kitchen:all').emit('order:confirmed', { order });
      const stationCodes = [...new Set(order.items.map((it) => it.station?.code).filter(Boolean))];
      for (const code of stationCodes) {
        io.to(`kitchen:station:${code}`).emit('order:confirmed', { order });
      }
      io.to('role:waiter').to('role:manager').to('role:owner').emit('order:updated', { order });
      io.to(`table_session:${order.table_session_id}`).emit('order:updated', { order });
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
}

export async function markOrderServed(req, res, next) {
  try {
    const { Order, OrderItem, Table, sequelize } = getModels();
    const order = await Order.findByPk(req.params.orderId, {
      include: [{ model: Table, as: 'table', attributes: ['id', 'table_number', 'label'] }],
    });
    if (!order) {
      throw new AppError(404, 'Order not found.', 'ORDER_NOT_FOUND');
    }
    if (!['ready', 'preparing', 'confirmed'].includes(order.status)) {
      throw new AppError(409, `Order cannot be marked served from "${order.status}".`, 'INVALID_ORDER_STATE');
    }

    await sequelize.transaction(async (transaction) => {
      await order.update({ status: 'served' }, { transaction });
      await OrderItem.update({ status: 'served' }, { where: { order_id: order.id }, transaction });
    });

    const updated = await Order.findByPk(order.id, {
      include: [
        { model: Table, as: 'table', attributes: ['id', 'table_number', 'label'] },
        { model: OrderItem, as: 'items' },
      ],
    });

    const io = req.app.get('io');
    if (io) {
      io.to('kitchen:all').emit('order:updated', { order: updated });
      io.to('role:waiter').to('role:manager').to('role:owner').emit('order:updated', { order: updated });
      io.to(`table_session:${order.table_session_id}`).emit('order:updated', { order: updated });
    }

    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

export async function listPendingWaiterCalls(_req, res, next) {
  try {
    const { WaiterCall, Table } = getModels();
    const calls = await WaiterCall.findAll({
      where: { status: 'pending' },
      include: [{ model: Table, as: 'table', attributes: ['id', 'table_number', 'label', 'zone'] }],
      order: [['created_at', 'ASC']],
    });
    res.json({ calls });
  } catch (err) {
    next(err);
  }
}

export async function resolveWaiterCall(req, res, next) {
  try {
    const { WaiterCall, Table, Order } = getModels();
    const call = await WaiterCall.findByPk(req.params.callId, {
      include: [{ model: Table, as: 'table' }],
    });
    if (!call) {
      throw new AppError(404, 'Waiter call not found.', 'WAITER_CALL_NOT_FOUND');
    }
    if (call.status === 'resolved') {
      return res.json({ call });
    }

    await call.update({
      status: 'resolved',
      resolved_by: req.user.id,
      resolved_at: new Date(),
    });

    const pendingOthers = await WaiterCall.count({
      where: { table_id: call.table_id, status: 'pending' },
    });
    let nextTableStatus = call.table?.status || 'free';
    if (pendingOthers === 0 && call.table?.status === 'needs_help') {
      const openOrders = await Order.count({
        where: { table_id: call.table_id, status: { [Op.in]: ['received', 'confirmed', 'preparing', 'ready'] } },
      });
      nextTableStatus = openOrders > 0 ? 'ordered' : 'free';
      await Table.update({ status: nextTableStatus }, { where: { id: call.table_id } });
    }

    const io = req.app.get('io');
    if (io) {
      io.to('role:waiter').to('role:manager').to('role:owner').emit('waiter:call_resolved', {
        callId: call.id,
        tableId: call.table_id,
        tableStatus: nextTableStatus,
      });
      io.to(`table_session:${call.table_session_id}`).emit('waiter:call_resolved', {
        callId: call.id,
      });
    }

    return res.json({ call, tableStatus: nextTableStatus });
  } catch (err) {
    next(err);
  }
}

export async function updateTableStatus(req, res, next) {
  try {
    const { Table } = getModels();
    const table = await Table.findByPk(req.params.tableId);
    if (!table) {
      throw new AppError(404, 'Table not found.', 'TABLE_NOT_FOUND');
    }
    await table.update({ status: req.body.status });
    const io = req.app.get('io');
    if (io) {
      io.to('role:waiter').to('role:manager').to('role:owner').emit('table:status_changed', {
        id: table.id,
        table_number: table.table_number,
        label: table.label,
        status: table.status,
      });
    }
    res.json({ table: { id: table.id, tableNumber: table.table_number, status: table.status } });
  } catch (err) {
    next(err);
  }
}
