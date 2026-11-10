import { DataTypes } from 'sequelize';
import { getSequelize } from '../../config/database.js';

export function defineModels(sequelize = getSequelize()) {
  const Role = sequelize.define(
    'Role',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.ENUM('owner', 'manager', 'waiter', 'chef'), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(255), allowNull: true },
    },
    { tableName: 'roles' }
  );

  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      email: { type: DataTypes.STRING(190), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      role_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      failed_login_attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      locked_until: { type: DataTypes.DATE, allowNull: true },
      token_version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    },
    { tableName: 'users' }
  );

  const RefreshToken = sequelize.define(
    'RefreshToken',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
      family_id: { type: DataTypes.STRING(64), allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      revoked_at: { type: DataTypes.DATE, allowNull: true },
      replaced_by_hash: { type: DataTypes.CHAR(64), allowNull: true },
    },
    { tableName: 'refresh_tokens' }
  );

  const Table = sequelize.define(
    'Table',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      table_number: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      label: { type: DataTypes.STRING(80), allowNull: false },
      capacity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 4 },
      zone: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Main Hall' },
      qr_token: { type: DataTypes.STRING(96), allowNull: false, unique: true },
      status: {
        type: DataTypes.ENUM('free', 'ordered', 'needs_help', 'bill_requested'),
        allowNull: false,
        defaultValue: 'free',
      },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'tables' }
  );

  const TableSession = sequelize.define(
    'TableSession',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      table_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      session_token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
      status: {
        type: DataTypes.ENUM('active', 'paid', 'expired', 'closed'),
        allowNull: false,
        defaultValue: 'active',
      },
      guest_email: { type: DataTypes.STRING(190), allowNull: true },
      last_activity_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      closed_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: 'table_sessions' }
  );

  const Category = sequelize.define(
    'Category',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(255), allowNull: true },
      sort_order: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'categories' }
  );

  const KitchenStation = sequelize.define(
    'KitchenStation',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(60), allowNull: false },
      code: { type: DataTypes.ENUM('grill', 'fry', 'drinks', 'dessert'), allowNull: false, unique: true },
      display_order: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'kitchen_stations' }
  );

  const MenuItem = sequelize.define(
    'MenuItem',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      category_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      station_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      image_url: { type: DataTypes.STRING(500), allowNull: true },
      base_price_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      is_veg: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      spice_level: {
        type: DataTypes.ENUM('none', 'mild', 'medium', 'hot', 'extra_hot'),
        allowNull: false,
        defaultValue: 'mild',
      },
      allergens: { type: DataTypes.JSON, allowNull: true },
      is_available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      prep_time_mins: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 15 },
    },
    { tableName: 'menu_items' }
  );

  const ItemVariant = sequelize.define(
    'ItemVariant',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      menu_item_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      name: { type: DataTypes.STRING(60), allowNull: false },
      price_delta_paise: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'item_variants' }
  );

  const Deal = sequelize.define(
    'Deal',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      title: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.STRING(255), allowNull: true },
      code: { type: DataTypes.STRING(40), allowNull: true, unique: true },
      discount_type: { type: DataTypes.ENUM('percent', 'flat_paise'), allowNull: false },
      discount_value: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      min_order_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      applicable_category_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      starts_at: { type: DataTypes.DATE, allowNull: true },
      ends_at: { type: DataTypes.DATE, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'deals' }
  );

  const Order = sequelize.define(
    'Order',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      order_number: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      table_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      table_session_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      deal_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      status: {
        type: DataTypes.ENUM('received', 'confirmed', 'preparing', 'ready', 'served', 'cancelled'),
        allowNull: false,
        defaultValue: 'received',
      },
      confirmed_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      confirmed_at: { type: DataTypes.DATE, allowNull: true },
      subtotal_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      discount_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      cgst_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      sgst_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      tip_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      total_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      notes: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'orders' }
  );

  const OrderItem = sequelize.define(
    'OrderItem',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      menu_item_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      variant_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      station_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      item_name_snapshot: { type: DataTypes.STRING(120), allowNull: false },
      variant_name_snapshot: { type: DataTypes.STRING(60), allowNull: true },
      unit_price_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      line_total_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      status: {
        type: DataTypes.ENUM('queued', 'preparing', 'ready', 'served'),
        allowNull: false,
        defaultValue: 'queued',
      },
      special_instructions: { type: DataTypes.STRING(250), allowNull: true },
    },
    { tableName: 'order_items' }
  );

  const WaiterCall = sequelize.define(
    'WaiterCall',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      table_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      table_session_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      reason: { type: DataTypes.STRING(200), allowNull: false, defaultValue: 'Assistance requested' },
      status: { type: DataTypes.ENUM('pending', 'resolved'), allowNull: false, defaultValue: 'pending' },
      resolved_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      resolved_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: 'waiter_calls' }
  );

  const BillSplit = sequelize.define(
    'BillSplit',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      table_session_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      split_type: { type: DataTypes.ENUM('full', 'equal', 'by_item'), allowNull: false, defaultValue: 'full' },
      part_number: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      total_parts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      subtotal_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      discount_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      cgst_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      sgst_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      tip_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      amount_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      item_ids_json: { type: DataTypes.JSON, allowNull: true },
      status: { type: DataTypes.ENUM('pending', 'paid'), allowNull: false, defaultValue: 'pending' },
    },
    { tableName: 'bill_splits' }
  );

  const Payment = sequelize.define(
    'Payment',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      table_session_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      bill_split_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      razorpay_order_id: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      razorpay_payment_id: { type: DataTypes.STRING(80), allowNull: true, unique: true },
      amount_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      tip_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'INR' },
      method: { type: DataTypes.STRING(40), allowNull: true },
      status: {
        type: DataTypes.ENUM('created', 'authorized', 'captured', 'failed', 'refunded'),
        allowNull: false,
        defaultValue: 'created',
      },
      receipt_email: { type: DataTypes.STRING(190), allowNull: true },
      receipt_sent_at: { type: DataTypes.DATE, allowNull: true },
      webhook_event_id: { type: DataTypes.STRING(100), allowNull: true, unique: true },
    },
    { tableName: 'payments' }
  );

  const Review = sequelize.define(
    'Review',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      table_session_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
      table_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      comment: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'reviews' }
  );

  const AuditLog = sequelize.define(
    'AuditLog',
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      actor_user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      actor_role: { type: DataTypes.STRING(40), allowNull: true },
      action: { type: DataTypes.STRING(100), allowNull: false },
      entity_type: { type: DataTypes.STRING(60), allowNull: false },
      entity_id: { type: DataTypes.STRING(64), allowNull: true },
      ip_address: { type: DataTypes.STRING(64), allowNull: true },
      user_agent: { type: DataTypes.STRING(255), allowNull: true },
      metadata_json: { type: DataTypes.JSON, allowNull: true },
    },
    { tableName: 'audit_logs', updatedAt: false }
  );

  // Associations
  Role.hasMany(User, { foreignKey: 'role_id', as: 'users' });
  User.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

  User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' });
  RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

  Table.hasMany(TableSession, { foreignKey: 'table_id', as: 'sessions' });
  TableSession.belongsTo(Table, { foreignKey: 'table_id', as: 'table' });

  Category.hasMany(MenuItem, { foreignKey: 'category_id', as: 'items' });
  MenuItem.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

  KitchenStation.hasMany(MenuItem, { foreignKey: 'station_id', as: 'menuItems' });
  MenuItem.belongsTo(KitchenStation, { foreignKey: 'station_id', as: 'station' });

  MenuItem.hasMany(ItemVariant, { foreignKey: 'menu_item_id', as: 'variants' });
  ItemVariant.belongsTo(MenuItem, { foreignKey: 'menu_item_id', as: 'menuItem' });

  Category.hasMany(Deal, { foreignKey: 'applicable_category_id', as: 'deals' });
  Deal.belongsTo(Category, { foreignKey: 'applicable_category_id', as: 'category' });

  Table.hasMany(Order, { foreignKey: 'table_id', as: 'orders' });
  Order.belongsTo(Table, { foreignKey: 'table_id', as: 'table' });

  TableSession.hasMany(Order, { foreignKey: 'table_session_id', as: 'orders' });
  Order.belongsTo(TableSession, { foreignKey: 'table_session_id', as: 'tableSession' });

  Order.belongsTo(Deal, { foreignKey: 'deal_id', as: 'deal' });
  Order.belongsTo(User, { foreignKey: 'confirmed_by', as: 'confirmedByUser' });

  Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
  OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

  MenuItem.hasMany(OrderItem, { foreignKey: 'menu_item_id', as: 'orderItems' });
  OrderItem.belongsTo(MenuItem, { foreignKey: 'menu_item_id', as: 'menuItem' });

  ItemVariant.hasMany(OrderItem, { foreignKey: 'variant_id', as: 'orderItems' });
  OrderItem.belongsTo(ItemVariant, { foreignKey: 'variant_id', as: 'variant' });

  KitchenStation.hasMany(OrderItem, { foreignKey: 'station_id', as: 'orderItems' });
  OrderItem.belongsTo(KitchenStation, { foreignKey: 'station_id', as: 'station' });

  Table.hasMany(WaiterCall, { foreignKey: 'table_id', as: 'waiterCalls' });
  WaiterCall.belongsTo(Table, { foreignKey: 'table_id', as: 'table' });

  TableSession.hasMany(WaiterCall, { foreignKey: 'table_session_id', as: 'waiterCalls' });
  WaiterCall.belongsTo(TableSession, { foreignKey: 'table_session_id', as: 'tableSession' });

  WaiterCall.belongsTo(User, { foreignKey: 'resolved_by', as: 'resolvedByUser' });

  TableSession.hasMany(BillSplit, { foreignKey: 'table_session_id', as: 'billSplits' });
  BillSplit.belongsTo(TableSession, { foreignKey: 'table_session_id', as: 'tableSession' });

  TableSession.hasMany(Payment, { foreignKey: 'table_session_id', as: 'payments' });
  Payment.belongsTo(TableSession, { foreignKey: 'table_session_id', as: 'tableSession' });

  BillSplit.hasMany(Payment, { foreignKey: 'bill_split_id', as: 'payments' });
  Payment.belongsTo(BillSplit, { foreignKey: 'bill_split_id', as: 'billSplit' });

  TableSession.hasOne(Review, { foreignKey: 'table_session_id', as: 'review' });
  Review.belongsTo(TableSession, { foreignKey: 'table_session_id', as: 'tableSession' });

  Table.hasMany(Review, { foreignKey: 'table_id', as: 'reviews' });
  Review.belongsTo(Table, { foreignKey: 'table_id', as: 'table' });

  User.hasMany(AuditLog, { foreignKey: 'actor_user_id', as: 'auditLogs' });
  AuditLog.belongsTo(User, { foreignKey: 'actor_user_id', as: 'actor' });

  return {
    sequelize,
    Role,
    User,
    RefreshToken,
    Table,
    TableSession,
    Category,
    KitchenStation,
    MenuItem,
    ItemVariant,
    Deal,
    Order,
    OrderItem,
    WaiterCall,
    BillSplit,
    Payment,
    Review,
    AuditLog,
  };
}

let cachedModels = null;

export function getModels() {
  if (!cachedModels) {
    cachedModels = defineModels(getSequelize());
  }
  return cachedModels;
}

export function setModels(models) {
  cachedModels = models;
}
