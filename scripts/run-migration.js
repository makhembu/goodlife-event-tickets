const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_tysInbl3YFp9@ep-noisy-tree-adn50w2x.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
    ssl: { rejectUnauthorized: false }
  });

  const sql = fs.readFileSync(path.join(__dirname, 'migrate-event-association.sql'), 'utf8');
  
  try {
    console.log('Running migration...');
    await pool.query(sql);
    console.log('Migration completed successfully!');
    
    // Verify
    const { rows: events } = await pool.query('SELECT * FROM events');
    console.log(`Events table: ${events.length} row(s)`);
    
    const { rows: tickets } = await pool.query('SELECT COUNT(*) as total, COUNT(event_id) as linked FROM tickets');
    console.log(`Tickets: ${tickets[0].total} total, ${tickets[0].linked} linked to event`);
    
    const { rows: tiers } = await pool.query('SELECT COUNT(*) as total, COUNT(event_id) as linked FROM ticket_tiers');
    console.log(`Tiers: ${tiers[0].total} total, ${tiers[0].linked} linked to event`);
    
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

runMigration();
