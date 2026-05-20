// @ts-nocheck
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/sinavsalonu_v2' });
c.connect().then(async () => {
  // Find educator
  const edu = await c.query("SELECT id, email, name FROM users WHERE email ILIKE '%educator@demo%' LIMIT 1");
  console.log('Educator:', JSON.stringify(edu.rows[0]));

  // Find candidate
  const cand = await c.query("SELECT id, email FROM users WHERE email = 'aday@demo.com' LIMIT 1");
  console.log('Candidate:', JSON.stringify(cand.rows[0]));

  // Find reviews
  const reviews = await c.query('SELECT id, "testId", "educatorId", "candidateId", "testRating", "educatorRating", comment, "createdAt" FROM reviews ORDER BY "createdAt" DESC LIMIT 20');
  console.log('All reviews count:', reviews.rows.length);
  console.log('Reviews:', JSON.stringify(reviews.rows, null, 2));

  await c.end();
}).catch(e => { console.error(e.message); process.exit(1); });
