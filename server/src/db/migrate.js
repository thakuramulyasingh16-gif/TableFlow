import { DataTypes } from 'sequelize';
import { getSequelize } from '../config/database.js';
import { logger } from '../config/logger.js';
import * as migration001 from './migrations/001_initial_schema.js';

const MIGRATIONS = [migration001];

export async function runMigrations(sequelize = getSequelize()) {
  const queryInterface = sequelize.getQueryInterface();

  await queryInterface.createTable('schema_migrations', {
    id: { type: DataTypes.STRING(120), primaryKey: true },
    applied_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  const [appliedRows] = await sequelize.query('SELECT id FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    logger.info({ migration: migration.id }, 'Applying migration');
    await migration.up(queryInterface, sequelize);
    await sequelize.query('INSERT INTO schema_migrations (id, applied_at) VALUES (:id, :appliedAt)', {
      replacements: { id: migration.id, appliedAt: new Date() },
    });
    logger.info({ migration: migration.id }, 'Applied migration');
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('migrate.js')) {
  const sequelize = getSequelize();
  runMigrations(sequelize)
    .then(() => {
      logger.info('All migrations completed');
      return sequelize.close();
    })
    .catch((err) => {
      logger.error({ err }, 'Migration failed');
      process.exit(1);
    });
}
