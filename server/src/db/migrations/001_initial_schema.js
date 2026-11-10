import { DataTypes } from 'sequelize';

export const id = '001_initial_schema';

export async function up(queryInterface) {
  // 1. roles
  await queryInterface.createTable('roles', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.ENUM('owner', 'manager', 'waiter', 'chef'), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // 2. users
  await queryInterface.createTable('users', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(190), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    role_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'roles', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    failed_login_attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    locked_until: { type: DataTypes.DATE, allowNull: true },
    token_version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('users', ['role_id'], { name: 'idx_users_role_id' });

  // 3. refresh_tokens
  await queryInterface.createTable('refresh_tokens', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    family_id: { type: DataTypes.STRING(64), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    replaced_by_hash: { type: DataTypes.CHAR(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('refresh_tokens', ['user_id'], { name: 'idx_refresh_tokens_user_id' });
  await queryInterface.addIndex('refresh_tokens', ['family_id'], { name: 'idx_refresh_tokens_family_id' });

  // 4. tables
  await queryInterface.createTable('tables', {
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
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('tables', ['status'], { name: 'idx_tables_status' });

  // 5. table_sessions
  await queryInterface.createTable('table_sessions', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    table_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'tables', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
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
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('table_sessions', ['table_id', 'status'], { name: 'idx_table_sessions_table_status' });
  await queryInterface.addIndex('table_sessions', ['expires_at'], { name: 'idx_table_sessions_expires_at' });

  // 6. categories
  await queryInterface.createTable('categories', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(255), allowNull: true },
    sort_order: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // 7. kitchen_stations
  await queryInterface.createTable('kitchen_stations', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(60), allowNull: false },
    code: { type: DataTypes.ENUM('grill', 'fry', 'drinks', 'dessert'), allowNull: false, unique: true },
    display_order: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // 8. menu_items
  await queryInterface.createTable('menu_items', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    category_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'categories', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    station_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'kitchen_stations', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
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
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('menu_items', ['category_id', 'is_available'], { name: 'idx_menu_items_cat_avail' });
  await queryInterface.addIndex('menu_items', ['station_id'], { name: 'idx_menu_items_station' });

  // 9. item_variants
  await queryInterface.createTable('item_variants', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    menu_item_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'menu_items', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    name: { type: DataTypes.STRING(60), allowNull: false },
    price_delta_paise: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('item_variants', ['menu_item_id'], { name: 'idx_item_variants_menu_item' });

  // 10. deals
  await queryInterface.createTable('deals', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    code: { type: DataTypes.STRING(40), allowNull: true, unique: true },
    discount_type: { type: DataTypes.ENUM('percent', 'flat_paise'), allowNull: false },
    discount_value: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    min_order_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    applicable_category_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'categories', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    starts_at: { type: DataTypes.DATE, allowNull: true },
    ends_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('deals', ['is_active'], { name: 'idx_deals_active' });

  // 11. orders
  await queryInterface.createTable('orders', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    order_number: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    table_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'tables', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    table_session_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'table_sessions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    deal_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'deals', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    status: {
      type: DataTypes.ENUM('received', 'confirmed', 'preparing', 'ready', 'served', 'cancelled'),
      allowNull: false,
      defaultValue: 'received',
    },
    confirmed_by: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    confirmed_at: { type: DataTypes.DATE, allowNull: true },
    subtotal_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    discount_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    cgst_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    sgst_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    tip_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    total_paise: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('orders', ['table_session_id', 'status'], { name: 'idx_orders_session_status' });
  await queryInterface.addIndex('orders', ['table_id', 'created_at'], { name: 'idx_orders_table_created' });
  await queryInterface.addIndex('orders', ['status', 'created_at'], { name: 'idx_orders_status_created' });

  // 12. order_items
  await queryInterface.createTable('order_items', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    order_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'orders', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    menu_item_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'menu_items', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    variant_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'item_variants', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    station_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'kitchen_stations', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
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
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('order_items', ['order_id'], { name: 'idx_order_items_order' });
  await queryInterface.addIndex('order_items', ['station_id', 'status'], { name: 'idx_order_items_station_status' });

  // 13. waiter_calls
  await queryInterface.createTable('waiter_calls', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    table_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'tables', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    table_session_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'table_sessions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    reason: { type: DataTypes.STRING(200), allowNull: false, defaultValue: 'Assistance requested' },
    status: { type: DataTypes.ENUM('pending', 'resolved'), allowNull: false, defaultValue: 'pending' },
    resolved_by: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('waiter_calls', ['status', 'created_at'], { name: 'idx_waiter_calls_status' });
  await queryInterface.addIndex('waiter_calls', ['table_session_id', 'created_at'], { name: 'idx_waiter_calls_session' });

  // 14. bill_splits
  await queryInterface.createTable('bill_splits', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    table_session_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'table_sessions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
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
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('bill_splits', ['table_session_id', 'status'], { name: 'idx_bill_splits_session_status' });

  // 15. payments
  await queryInterface.createTable('payments', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    table_session_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'table_sessions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    bill_split_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'bill_splits', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
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
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('payments', ['table_session_id', 'status'], { name: 'idx_payments_session_status' });
  await queryInterface.addIndex('payments', ['created_at'], { name: 'idx_payments_created_at' });

  // 16. reviews
  await queryInterface.createTable('reviews', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    table_session_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      unique: true,
      references: { model: 'table_sessions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    table_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'tables', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    comment: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('reviews', ['table_id', 'rating'], { name: 'idx_reviews_table_rating' });

  // 17. audit_logs
  await queryInterface.createTable('audit_logs', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    actor_user_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    actor_role: { type: DataTypes.STRING(40), allowNull: true },
    action: { type: DataTypes.STRING(100), allowNull: false },
    entity_type: { type: DataTypes.STRING(60), allowNull: false },
    entity_id: { type: DataTypes.STRING(64), allowNull: true },
    ip_address: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.STRING(255), allowNull: true },
    metadata_json: { type: DataTypes.JSON, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('audit_logs', ['action', 'created_at'], { name: 'idx_audit_logs_action_created' });
  await queryInterface.addIndex('audit_logs', ['actor_user_id'], { name: 'idx_audit_logs_actor' });
}

export async function down(queryInterface) {
  const tables = [
    'audit_logs',
    'reviews',
    'payments',
    'bill_splits',
    'waiter_calls',
    'order_items',
    'orders',
    'deals',
    'item_variants',
    'menu_items',
    'kitchen_stations',
    'categories',
    'table_sessions',
    'tables',
    'refresh_tokens',
    'users',
    'roles',
  ];
  for (const t of tables) {
    await queryInterface.dropTable(t);
  }
}
