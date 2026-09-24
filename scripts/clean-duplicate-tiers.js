const { Pool } = require('pg');

async function cleanDuplicates() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Starting tier deduplication...');

    // Mapping of old tier IDs to the new active tier IDs
    const replacements = {
      'die-hard': 'die-hard-400',
      'early-bird': 'early-bird-550',
      'advance': 'advance-750',
      'REG 1000': 'regular-gate-1000',
      'regular-gate': 'regular-gate-1000',
      'camp-2px-matt': '2px-tent-mattress-2500',
      'camp-2px-bag': '2px-tent-sleepingbag-2400',
      'camp-4px-bag': '4px-tent-sleepingbag-2400',
      'camp-6px-bag': '6px-tent-sleepingbag-3000'
    };

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const [oldId, newId] of Object.entries(replacements)) {
        // Update tickets to point to the new tier
        const res1 = await client.query('UPDATE tickets SET ticket_type = $1 WHERE ticket_type = $2', [newId, oldId]);
        console.log(`Migrated ${res1.rowCount} tickets from ${oldId} to ${newId}`);

        // Update pending_payments
        const res2 = await client.query('UPDATE pending_payments SET ticket_type = $1 WHERE ticket_type = $2', [newId, oldId]);
        console.log(`Migrated ${res2.rowCount} pending_payments from ${oldId} to ${newId}`);

        // Delete the old tier
        const res3 = await client.query('DELETE FROM ticket_tiers WHERE id = $1', [oldId]);
        console.log(`Deleted old tier ${oldId}: ${res3.rowCount} rows removed`);
      }

      await client.query('COMMIT');
      console.log('Deduplication completed successfully!');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

cleanDuplicates();
