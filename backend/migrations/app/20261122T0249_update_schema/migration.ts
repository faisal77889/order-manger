#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/ebf678c2aff00eb2d9ea9b3e83b3aaa183385d10f410abff6e2325ebe26b64b0/contract';
import startContract from '../../snapshots/ebf678c2aff00eb2d9ea9b3e83b3aaa183385d10f410abff6e2325ebe26b64b0/contract.json' with { type: 'json' };
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
      this.addUnique({
        schema: 'public',
        table: 'admin_users',
        constraint: 'admin_users_email_key',
        columns: ['email'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
