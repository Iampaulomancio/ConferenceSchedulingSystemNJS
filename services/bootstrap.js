const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function seedAdminUser() {
  const email = process.env.ADMIN_SEED_EMAIL || 'admin@example.com';
  const name = process.env.ADMIN_SEED_NAME || 'System Admin';
  const password = process.env.ADMIN_SEED_PASSWORD || 'Admin@12345';

  const [existing] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length) return;

  const hashedPassword = await bcrypt.hash(password, 10);
  await db.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, email, hashedPassword, 'admin']
  );

  console.log(`Seeded admin user: ${email}`);
}

module.exports = { seedAdminUser };
