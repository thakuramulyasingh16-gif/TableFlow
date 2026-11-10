import { Op } from 'sequelize';
import { getModels } from '../db/models/index.js';
import { AppError } from '../utils/AppError.js';

export async function getKitchenQueue(_req, res, next) {
  try {
    const { KitchenStation, Order, OrderItem, Table } = getModels();
    const [stations, orders] = await Promise.all([
      KitchenStation.findAll({ order: [['display_order', 'ASC']] }),
      Order.findAll({
        where: { status: { [Op.in]: ['confirmed', 'preparing', 'ready'] } },
        include: [
          { model: Table, as: 'table', attributes: ['id', 'table_number', 'label'] },
          {
            model: OrderItem,
            as: 'items',
            include: [{ model: KitchenStation, as: 'station', attributes: ['id', 'name', 'code'] }],
          },
        ],
        order: [['confirmed_at', 'ASC'], ['created_at', 'ASC']],
      }),
    ]);

    const grouped = stations.map((st) => {
      const stationTickets = [];
      for (const ord of orders) {
        const stationItems = (ord.items || []).filter((it) => it.station_id === st.id && it.status !== 'served');
        if (stationItems.length > 0) {
          stationTickets.push({
            orderId: ord.id,
            orderNumber: ord.order_number,
            orderStatus: ord.status,
            table: ord.table,
            confirmedAt: ord.confirmed_at || ord.created_at,
            notes: ord.notes,
            items: stationItems,
          });
        }
      }
      return {
        station: st,
        tickets: stationTickets,
      };
    });

    res.json({ stations: grouped });
  } catch (err) {
    next(err);
  }
}

export async function updateKitchenItemStatus(req, res, next) {
  try {
    const { OrderItem, Order, Table, KitchenStation, sequelize } = getModels();
    const item = await OrderItem.findByPk(req.params.itemId, {
      include: [
        { model: KitchenStation, as: 'station', attributes: ['id', 'name', 'code'] },
        { model: Order, as: 'order' },
      ],
    });

    if (!item || !item.order) {
      throw new AppError(404, 'Order item not found.', 'ORDER_ITEM_NOT_FOUND');
    }
    if (!['confirmed', 'preparing', 'ready'].includes(item.order.status)) {
      throw new AppError(409, 'Order must be confirmed by staff before kitchen preparation.', 'ORDER_NOT_CONFIRMED');
    }

    const nextStatus = req.body.status;
    let updatedOrder;

    await sequelize.transaction(async (transaction) => {
      await item.update({ status: nextStatus }, { transaction });

      const siblingItems = await OrderItem.findAll({
        where: { order_id: item.order_id },
        transaction,
      });

      const allReadyOrServed = siblingItems.every((si) => si.status === 'ready' || si.status === 'served');
      const anyPreparingOrReady = siblingItems.some((si) => si.status === 'preparing' || si.status === 'ready');

      let nextOrderStatus = item.order.status;
      if (allReadyOrServed) {
        nextOrderStatus = 'ready';
      } else if (anyPreparingOrReady) {
        nextOrderStatus = 'preparing';
      }

      if (nextOrderStatus !== item.order.status) {
        await item.order.update({ status: nextOrderStatus }, { transaction });
      }

      updatedOrder = await Order.findByPk(item.order_id, {
        include: [
          { model: Table, as: 'table', attributes: ['id', 'table_number', 'label'] },
          {
            model: OrderItem,
            as: 'items',
            include: [{ model: KitchenStation, as: 'station', attributes: ['id', 'name', 'code'] }],
          },
        ],
        transaction,
      });
    });

    const io = req.app.get('io');
    if (io) {
      io.to('kitchen:all').emit('kitchen:item_updated', {
        orderId: updatedOrder.id,
        itemId: item.id,
        itemStatus: nextStatus,
        orderStatus: updatedOrder.status,
      });
      io.to('role:waiter').to('role:manager').to('role:owner').emit('order:updated', { order: updatedOrder });
      io.to(`table_session:${updatedOrder.table_session_id}`).emit('order:updated', { order: updatedOrder });
    }

    res.json({ item, order: updatedOrder });
  } catch (err) {
    next(err);
  }
}
