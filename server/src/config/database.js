import { Sequelize } from 'sequelize';
import { getEnv } from './env.js';
import { logger } from './logger.js';

let sequelizeInstance = null;

export function createSequelize(env = getEnv()) {
  return new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
    host: env.DB_HOST,
    port: env.DB_PORT,
    dialect: 'mysql',
    logging: env.NODE_ENV === 'development' ? (msg) => logger.debug({ sql: msg }, 'sequelize') : false,
    dialectOptions: env.DB_SSL
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: true,
          },
        }
      : {},
    pool: {
      max: 15,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      underscored: true,
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
  });
}

export function getSequelize() {
  if (!sequelizeInstance) {
    sequelizeInstance = createSequelize();
  }
  return sequelizeInstance;
}

export function setSequelize(instance) {
  sequelizeInstance = instance;
}
