import { describe, expect, it } from 'vitest';
import { query, withTransaction } from '../../src/database/db';

describe('SQLite transaction queue', () => {
  it('evita que una consulta externa se intercale dentro de una transacción', async () => {
    await query.run(`
      CREATE TABLE IF NOT EXISTS transaction_probe (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        marker TEXT NOT NULL
      )
    `);
    await query.run('DELETE FROM transaction_probe');

    const transaction = withTransaction(async () => {
      await query.run('INSERT INTO transaction_probe (marker) VALUES (?)', ['transaction-start']);
      await new Promise(resolve => setTimeout(resolve, 40));
      await query.run('INSERT INTO transaction_probe (marker) VALUES (?)', ['transaction-end']);
    });

    await new Promise(resolve => setTimeout(resolve, 5));
    const outsideQuery = query.run('INSERT INTO transaction_probe (marker) VALUES (?)', ['outside']);

    await Promise.all([transaction, outsideQuery]);

    const rows = await query.all('SELECT marker FROM transaction_probe ORDER BY id ASC');
    expect(rows.map(row => row.marker)).toEqual([
      'transaction-start',
      'transaction-end',
      'outside'
    ]);
  });
});
