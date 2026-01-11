#!/usr/bin/env node
/**
 * Fetch all available TLDs from eNom and set pricing
 * Usage: node fetch-all-tlds.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const https = require('https');
const querystring = require('querystring');

const pool = new Pool({
  host: process.env.DB_HOST || 'worxtech-db',
  database: process.env.DB_NAME || 'worxtech',
  user: process.env.DB_USER || 'worxtech',
  password: process.env.DB_PASSWORD
});

// Comprehensive list of popular TLDs to check
const TLDS_TO_CHECK = [
  // Generic TLDs
  'com', 'net', 'org', 'info', 'biz', 'mobi', 'name', 'pro',
  // Country codes
  'us', 'co', 'me', 'tv', 'cc', 'ws', 'io', 'ai', 'gg', 'fm', 'am', 'to',
  // New gTLDs - Tech
  'dev', 'app', 'tech', 'cloud', 'digital', 'online', 'website', 'site', 'web', 'host', 'hosting', 'software', 'network', 'systems', 'computer', 'email',
  // New gTLDs - Business
  'company', 'business', 'agency', 'solutions', 'services', 'consulting', 'enterprises', 'group', 'partners', 'global', 'international', 'world', 'zone', 'center', 'studio',
  // New gTLDs - Industry
  'construction', 'builders', 'contractors', 'plumbing', 'engineering', 'architect', 'design', 'graphics', 'photography', 'photo', 'pictures', 'media', 'news', 'press',
  // New gTLDs - Commerce
  'shop', 'store', 'market', 'buy', 'sale', 'deals', 'discount', 'promo', 'coupons', 'bargains',
  // New gTLDs - Finance
  'finance', 'financial', 'investments', 'capital', 'money', 'cash', 'fund', 'tax', 'accountant', 'accountants', 'insurance', 'loans', 'mortgage', 'credit', 'bank',
  // New gTLDs - Real Estate
  'realty', 'properties', 'property', 'land', 'house', 'homes', 'apartments', 'condos', 'rentals',
  // New gTLDs - Food/Drink
  'restaurant', 'cafe', 'coffee', 'pizza', 'kitchen', 'recipes', 'cooking', 'wine', 'beer', 'pub', 'bar',
  // New gTLDs - Health
  'health', 'healthcare', 'fitness', 'diet', 'clinic', 'dental', 'doctor', 'hospital', 'medical', 'surgery', 'rehab', 'pharmacy',
  // New gTLDs - Education
  'education', 'school', 'college', 'university', 'academy', 'institute', 'training', 'courses',
  // New gTLDs - Legal
  'law', 'legal', 'lawyer', 'attorney', 'claims',
  // New gTLDs - Entertainment
  'video', 'movie', 'film', 'show', 'theater', 'tickets', 'events', 'games', 'game', 'bet', 'casino', 'poker', 'lotto',
  // New gTLDs - Travel
  'travel', 'flights', 'vacation', 'vacations', 'hotel', 'hotels', 'cruise', 'cruises', 'tours',
  // New gTLDs - Auto
  'auto', 'autos', 'car', 'cars', 'motorcycles', 'bike', 'parts', 'repair', 'tires',
  // New gTLDs - Lifestyle
  'life', 'lifestyle', 'living', 'fashion', 'style', 'beauty', 'fit', 'yoga', 'dance', 'art', 'gallery', 'tattoo',
  // New gTLDs - Personal/Social
  'blog', 'social', 'chat', 'dating', 'singles', 'love', 'wedding', 'family', 'baby', 'kids', 'mom', 'dad',
  // New gTLDs - Misc
  'club', 'team', 'fan', 'fans', 'vip', 'rocks', 'ninja', 'guru', 'expert', 'tips', 'guide', 'how', 'wtf', 'fail', 'lol', 'cool', 'best', 'top', 'one', 'plus',
  // New gTLDs - Location
  'city', 'town', 'place', 'space', 'land', 'earth', 'world',
  // New gTLDs - Industry Specific
  'cleaning', 'florist', 'flowers', 'garden', 'pet', 'pets', 'vet', 'dog', 'fish', 'horse', 'cab', 'taxi', 'limo', 'delivery', 'express', 'supply',
  // More country codes
  'uk', 'de', 'eu', 'ca', 'au', 'nz', 'in', 'jp', 'cn', 'br', 'mx', 'es', 'fr', 'it', 'nl', 'be', 'ch', 'at', 'se', 'no', 'dk', 'fi', 'pl', 'ru', 'za', 'sg', 'hk', 'tw', 'kr',
  // New popular TLDs
  'xyz', 'icu', 'top', 'vip', 'work', 'fun', 'wang', 'bid', 'win', 'stream', 'download', 'review', 'click', 'link', 'help', 'support', 'directory', 'report', 'today', 'now'
];

async function enomRequest(command, params = {}) {
  const queryParams = {
    command,
    uid: process.env.ENOM_UID,
    pw: process.env.ENOM_PW,
    ...params
  };

  const queryString = querystring.stringify(queryParams);
  const url = `/interface.asp?${queryString}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'reseller.enom.com',
      port: 443,
      path: url,
      method: 'GET',
      headers: { 'User-Agent': 'WorxTech/1.0' }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        // Parse text response
        const result = {};
        const lines = data.split('\n');
        for (const line of lines) {
          if (line.startsWith(';') || !line.includes('=')) continue;
          const eqIndex = line.indexOf('=');
          const key = line.substring(0, eqIndex).trim();
          const value = line.substring(eqIndex + 1).trim();
          if (key) result[key] = value;
        }

        if (result.ErrCount && parseInt(result.ErrCount) > 0) {
          reject(new Error(result.Err1 || 'Unknown error'));
        } else {
          resolve(result);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function getResellerPrice(tld) {
  try {
    const response = await enomRequest('PE_GetResellerPrice', {
      ProductType: 10, // Register
      TLD: tld
    });
    return parseFloat(response.price || response.Price || 0);
  } catch (error) {
    return null; // TLD not available
  }
}

async function getRenewPrice(tld) {
  try {
    const response = await enomRequest('PE_GetResellerPrice', {
      ProductType: 16, // Renew
      TLD: tld
    });
    return parseFloat(response.price || response.Price || 0);
  } catch (error) {
    return null;
  }
}

async function getTransferPrice(tld) {
  try {
    const response = await enomRequest('PE_GetResellerPrice', {
      ProductType: 19, // Transfer
      TLD: tld
    });
    return parseFloat(response.price || response.Price || 0);
  } catch (error) {
    return null;
  }
}

function calculateSalePrice(cost, avgMarginPercent) {
  // Calculate sale price based on cost + average margin
  const salePrice = cost * (1 + avgMarginPercent);

  // Round to .99 scheme
  const rounded = Math.ceil(salePrice) - 0.01;

  // Minimum margin of $3
  if (rounded - cost < 3) {
    return Math.ceil(cost + 3) - 0.01;
  }

  return rounded;
}

async function main() {
  // Validate required credentials - security fix
  if (!process.env.ENOM_UID || !process.env.ENOM_PW) {
    console.error('Error: ENOM_UID and ENOM_PW environment variables are required');
    process.exit(1);
  }

  console.log('Fetching TLD pricing from eNom...\n');

  // First get existing pricing to calculate average margin
  const existingResult = await pool.query(
    'SELECT tld, cost_register, price_register FROM tld_pricing WHERE cost_register > 0 AND price_register > 0'
  );

  let avgMarginPercent = 0.30; // Default 30% margin
  if (existingResult.rows.length > 0) {
    let totalMarginPercent = 0;
    for (const row of existingResult.rows) {
      const cost = parseFloat(row.cost_register);
      const price = parseFloat(row.price_register);
      if (cost > 0) {
        totalMarginPercent += (price - cost) / cost;
      }
    }
    avgMarginPercent = totalMarginPercent / existingResult.rows.length;
    console.log(`Existing TLDs: ${existingResult.rows.length}`);
    console.log(`Average margin: ${(avgMarginPercent * 100).toFixed(1)}%\n`);
  }

  const availableTLDs = [];
  const batchSize = 5; // Process 5 at a time to avoid rate limiting

  console.log(`Checking ${TLDS_TO_CHECK.length} TLDs...\n`);

  for (let i = 0; i < TLDS_TO_CHECK.length; i += batchSize) {
    const batch = TLDS_TO_CHECK.slice(i, i + batchSize);

    const results = await Promise.all(batch.map(async (tld) => {
      const cost = await getResellerPrice(tld);
      if (cost !== null && cost > 0) {
        const renewCost = await getRenewPrice(tld) || cost;
        const transferCost = await getTransferPrice(tld) || cost;
        return { tld, cost, renewCost, transferCost };
      }
      return null;
    }));

    for (const result of results) {
      if (result) {
        availableTLDs.push(result);
        process.stdout.write(`✓ .${result.tld} ($${result.cost.toFixed(2)})\n`);
      }
    }

    // Small delay between batches
    if (i + batchSize < TLDS_TO_CHECK.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\nFound ${availableTLDs.length} available TLDs\n`);

  // Now insert/update all TLDs
  console.log('Updating database...\n');

  let inserted = 0;
  let updated = 0;

  for (const tldData of availableTLDs) {
    const salePrice = calculateSalePrice(tldData.cost, avgMarginPercent);
    const renewPrice = calculateSalePrice(tldData.renewCost, avgMarginPercent);
    const transferPrice = calculateSalePrice(tldData.transferCost, avgMarginPercent);
    const privacyPrice = 9.99;

    // Check if TLD exists
    const existing = await pool.query('SELECT tld FROM tld_pricing WHERE tld = $1', [tldData.tld]);

    if (existing.rows.length > 0) {
      // Update existing - preserve sale price if manually set higher
      await pool.query(`
        UPDATE tld_pricing SET
          cost_register = $2,
          cost_renew = $3,
          cost_transfer = $4,
          price_register = GREATEST(price_register, $5),
          price_renew = GREATEST(price_renew, $6),
          price_transfer = GREATEST(price_transfer, $7),
          is_active = true,
          updated_at = NOW()
        WHERE tld = $1
      `, [tldData.tld, tldData.cost, tldData.renewCost, tldData.transferCost, salePrice, renewPrice, transferPrice]);
      updated++;
    } else {
      // Insert new
      await pool.query(`
        INSERT INTO tld_pricing (tld, cost_register, cost_renew, cost_transfer, price_register, price_renew, price_transfer, price_privacy, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      `, [tldData.tld, tldData.cost, tldData.renewCost, tldData.transferCost, salePrice, renewPrice, transferPrice, privacyPrice]);
      inserted++;
    }

    console.log(`.${tldData.tld}: cost $${tldData.cost.toFixed(2)} → sale $${salePrice.toFixed(2)} (margin $${(salePrice - tldData.cost).toFixed(2)})`);
  }

  console.log(`\nDone! Inserted: ${inserted}, Updated: ${updated}`);

  // Show final summary
  const finalResult = await pool.query(
    'SELECT COUNT(*) as count, SUM(price_register - cost_register) / COUNT(*) as avg_margin FROM tld_pricing WHERE is_active = true'
  );
  console.log(`\nTotal active TLDs: ${finalResult.rows[0].count}`);
  console.log(`Average margin: $${parseFloat(finalResult.rows[0].avg_margin).toFixed(2)}`);

  await pool.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
