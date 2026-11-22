#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/71e7b38123c411786586ac604af83cc56ebb0081f085cadda525112df1344fca/contract';
import startContract from '../../snapshots/71e7b38123c411786586ac604af83cc56ebb0081f085cadda525112df1344fca/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f966c9a6c171fc5d70f05f86cfaf249485ffa2480e07c6da28aa489f78e248f8/contract';
import endContract from '../../snapshots/f966c9a6c171fc5d70f05f86cfaf249485ffa2480e07c6da28aa489f78e248f8/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropTable({ schema: 'public', table: 'Customer' }),
      this.createTable({
        schema: 'public',
        table: 'admin_users',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('password', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('viewer'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('admin_users_role_check_f035e01f', sql`"role" IN ('admin', 'viewer')`),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'categories',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'customers',
        columns: [
          col('city', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'order_items',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('order_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('product_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('quantity', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('unit_price', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('quantity_positive_4402679f', sql`quantity > 0`),
          checkExpression('unit_price_positive_23fb6df1', sql`unit_price > 0`),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'orders',
        columns: [
          col('customer_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('order_date', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('total_amount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'orders_status_check_e89687fb',
            sql`"status" IN ('pending', 'paid', 'shipped', 'cancelled')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'products',
        columns: [
          col('category_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('price', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'admin_users',
        constraint: 'admin_users_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'categories',
        constraint: 'categories_name_key',
        columns: ['name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'customers',
        constraint: 'customers_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'order_items',
        index: 'order_items_order_id_idx_39ad19ad',
        columns: ['order_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'order_items',
        index: 'order_items_product_id_idx_22a2b7d2',
        columns: ['product_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'orders',
        index: 'orders_customer_id_idx_e16dfa6b',
        columns: ['customer_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'products',
        index: 'products_category_id_idx_da7213d4',
        columns: ['category_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'order_items',
        foreignKey: {
          name: 'order_items_order_id_fkey',
          columns: ['order_id'],
          references: { schema: 'public', table: 'orders', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'order_items',
        foreignKey: {
          name: 'order_items_product_id_fkey',
          columns: ['product_id'],
          references: { schema: 'public', table: 'products', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'orders',
        foreignKey: {
          name: 'orders_customer_id_fkey',
          columns: ['customer_id'],
          references: { schema: 'public', table: 'customers', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'products',
        foreignKey: {
          name: 'products_category_id_fkey',
          columns: ['category_id'],
          references: { schema: 'public', table: 'categories', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
