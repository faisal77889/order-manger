#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/273c9756ba28d7a85682b57549f8461a02ae3e3bbe9ca92b56356f3481eac06a/contract';
import endContract from '../../snapshots/273c9756ba28d7a85682b57549f8461a02ae3e3bbe9ca92b56356f3481eac06a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f966c9a6c171fc5d70f05f86cfaf249485ffa2480e07c6da28aa489f78e248f8/contract';
import startContract from '../../snapshots/f966c9a6c171fc5d70f05f86cfaf249485ffa2480e07c6da28aa489f78e248f8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'order_items',
        constraint: 'order_items_order_id_fkey',
        kind: 'foreignKey',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'order_items',
        constraint: 'unit_price_positive_23fb6df1',
      }),
      this.createTable({
        schema: 'public',
        table: 'audit_logs',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actor_email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('details', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('entity', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('entity_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('user_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'order_items',
        constraint: 'unit_price_positive_3c1fb11f',
        expression: sql`unit_price >= 0`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'orders',
        constraint: 'order_total_non_negative_b70a6922',
        expression: sql`total_amount >= 0`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'products',
        constraint: 'product_price_non_negative_faabb23d',
        expression: sql`price >= 0`,
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_logs',
        index: 'audit_logs_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'audit_logs',
        foreignKey: {
          name: 'audit_logs_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'admin_users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'order_items',
        foreignKey: {
          name: 'order_items_order_id_fkey',
          columns: ['order_id'],
          references: { schema: 'public', table: 'orders', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
