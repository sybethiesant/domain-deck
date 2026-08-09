#!/usr/bin/env node
/**
 * Store the credit card used to refill the eNom reseller balance.
 *
 * enom.refillAccount() sends full card details to eNom's RefillAccount API on
 * every top-up, so the card has to be retrievable unattended. It is stored
 * encrypted with AES-256-GCM under ENOM_CC_KEY at backend/.credentials.enc
 * (mode 0600, gitignored). This script is the only thing that writes that file.
 *
 * Usage, from inside the app container:
 *   docker exec -it worxtech sh -c 'cd /app/backend && node scripts/store-card.js'
 *   docker exec -it worxtech sh -c 'cd /app/backend && node scripts/store-card.js --verify'
 *
 * Needs a TTY — it prompts, and masks the card number and CVV as you type.
 * Card details are never written to logs or echoed back in full.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const readline = require('readline');
const {
  storeCredentials,
  loadCredentials,
  credentialsExist,
  CREDENTIALS_FILE
} = require('../services/crypto');

// eNom's RefillAccount CCType values. If a refill comes back rejecting the
// card type, re-run and pick a different spelling here.
const CARD_TYPES = [
  { label: 'Visa', value: 'Visa' },
  { label: 'MasterCard', value: 'MasterCard' },
  { label: 'American Express', value: 'AmericanExpress' },
  { label: 'Discover', value: 'Discover' }
];

function detectBrand(number) {
  if (/^4/.test(number)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'MasterCard';
  if (/^3[47]/.test(number)) return 'AmericanExpress';
  if (/^6(011|5)/.test(number)) return 'Discover';
  return null;
}

function luhnValid(number) {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let digit = parseInt(number[i], 10);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function mask(number) {
  return number.length > 4
    ? '*'.repeat(number.length - 4) + number.slice(-4)
    : '****';
}

function ask(rl, query) {
  return new Promise((resolve) => rl.question(query, (v) => resolve(v.trim())));
}

// Prompt without echoing what is typed — used for the card number and CVV so
// they never appear on screen or in scrollback.
function askHidden(rl, query) {
  return new Promise((resolve) => {
    const onData = () => {
      const masked = '*'.repeat(rl.line.length);
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(query + masked);
    };
    process.stdin.on('data', onData);
    rl.question(query, (value) => {
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(value.trim());
    });
  });
}

async function askUntil(rl, query, validate, { hidden = false } = {}) {
  for (;;) {
    const value = hidden ? await askHidden(rl, query) : await ask(rl, query);
    const problem = validate(value);
    if (!problem) return value;
    console.log('  ! ' + problem);
  }
}

function requireKey() {
  const key = process.env.ENOM_CC_KEY;
  if (!key) {
    console.error('ENOM_CC_KEY is not set. Add it to backend/.env before storing a card.');
    process.exit(1);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    console.error('ENOM_CC_KEY must be 64 hex characters (32 bytes). Generate one with:');
    console.error("  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    console.error('Changing the key makes any existing .credentials.enc unreadable — re-run this script after changing it.');
    process.exit(1);
  }
  return key;
}

async function verify() {
  const key = requireKey();
  if (!credentialsExist()) {
    console.log('No card stored. Expected file: ' + CREDENTIALS_FILE);
    console.log('Run this script with no arguments to store one.');
    process.exit(1);
  }
  let details;
  try {
    details = loadCredentials(key);
  } catch (e) {
    console.error('Stored card could not be decrypted: ' + e.message);
    console.error('This usually means ENOM_CC_KEY changed since the card was stored. Re-run to store it again.');
    process.exit(1);
  }
  console.log('Stored card decrypts cleanly:');
  console.log('  File:    ' + CREDENTIALS_FILE);
  console.log('  Type:    ' + details.CCType);
  console.log('  Name:    ' + details.CCName);
  console.log('  Number:  ' + mask(String(details.CCNumber || '')));
  console.log('  Expires: ' + details.CCMonth + '/' + details.CCYear);
  console.log('  Address: ' + details.ccaddress + ', ' + details.CCCity + ', ' +
    details.CCStateProvince + ' ' + details.cczip + ' ' + details.CCCountry);
  console.log('  Phone:   ' + details.CCPhone);
}

async function store() {
  const key = requireKey();

  if (!process.stdin.isTTY) {
    console.error('This script needs an interactive terminal. Run it with: docker exec -it ...');
    process.exit(1);
  }

  console.log('Store the eNom refill card. Nothing is echoed for the card number or CVV.');
  console.log('Encrypted with AES-256-GCM under ENOM_CC_KEY at: ' + CREDENTIALS_FILE);
  if (credentialsExist()) {
    console.log('\nA card is already stored — continuing will replace it.');
  }
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const number = (await askUntil(rl, 'Card number: ', (v) => {
      const digits = v.replace(/[\s-]/g, '');
      if (!/^\d+$/.test(digits)) return 'Digits only.';
      if (digits.length < 13 || digits.length > 19) return 'Expected 13-19 digits.';
      if (!luhnValid(digits)) return 'That number fails the checksum — check for a typo.';
      return null;
    }, { hidden: true })).replace(/[\s-]/g, '');

    const detected = detectBrand(number);
    console.log('\nCard type:');
    CARD_TYPES.forEach((t, i) => {
      console.log(`  ${i + 1}) ${t.label}${t.value === detected ? '   <- detected' : ''}`);
    });
    const defaultIndex = detected
      ? String(CARD_TYPES.findIndex((t) => t.value === detected) + 1)
      : '';
    const typeChoice = await askUntil(
      rl,
      `Select 1-${CARD_TYPES.length}${defaultIndex ? ` [${defaultIndex}]` : ''}: `,
      (v) => {
        const pick = v || defaultIndex;
        if (!pick) return 'Pick a card type.';
        const n = parseInt(pick, 10);
        return n >= 1 && n <= CARD_TYPES.length ? null : 'Out of range.';
      }
    );
    const CCType = CARD_TYPES[parseInt(typeChoice || defaultIndex, 10) - 1].value;

    const CCName = await askUntil(rl, 'Name on card: ', (v) => (v ? null : 'Required.'));

    const CCMonth = await askUntil(rl, 'Expiry month (MM): ', (v) => {
      const n = parseInt(v, 10);
      return n >= 1 && n <= 12 ? null : 'Enter 1-12.';
    });

    const CCYear = await askUntil(rl, 'Expiry year (YYYY): ', (v) => {
      if (!/^\d{4}$/.test(v)) return 'Enter 4 digits.';
      const now = new Date();
      const year = parseInt(v, 10);
      if (year < now.getFullYear()) return 'That year is in the past.';
      if (year === now.getFullYear() && parseInt(CCMonth, 10) < now.getMonth() + 1) {
        return 'That expiry is in the past.';
      }
      return null;
    });

    const cvv2 = await askUntil(rl, 'CVV: ', (v) => {
      if (!/^\d{3,4}$/.test(v)) return 'Enter 3 or 4 digits.';
      if (CCType === 'AmericanExpress' && v.length !== 4) return 'Amex uses a 4-digit CVV.';
      if (CCType !== 'AmericanExpress' && v.length !== 3) return 'Expected 3 digits.';
      return null;
    }, { hidden: true });

    console.log('\nBilling address as it appears on the card statement:');
    const ccaddress = await askUntil(rl, 'Street address: ', (v) => (v ? null : 'Required.'));
    const CCCity = await askUntil(rl, 'City: ', (v) => (v ? null : 'Required.'));
    const CCStateProvince = await askUntil(rl, 'State/Province: ', (v) => (v ? null : 'Required.'));
    const cczip = await askUntil(rl, 'Postal code: ', (v) => (v ? null : 'Required.'));
    const CCCountry = await askUntil(rl, 'Country code [US]: ', () => null) || 'US';
    const CCPhone = await askUntil(rl, 'Phone (+1.5551234567): ', (v) => (v ? null : 'Required.'));

    const cardDetails = {
      CCType,
      CCName,
      CCNumber: number,
      CCMonth: String(parseInt(CCMonth, 10)).padStart(2, '0'),
      CCYear,
      cvv2,
      ccaddress,
      CCCity,
      CCStateProvince,
      cczip,
      CCCountry,
      CCPhone
    };

    console.log('\nAbout to store:');
    console.log('  ' + CCType + '  ' + mask(number) + '  exp ' +
      cardDetails.CCMonth + '/' + CCYear + '  ' + CCName);
    console.log('  ' + ccaddress + ', ' + CCCity + ', ' + CCStateProvince + ' ' + cczip + ' ' + CCCountry);

    const confirm = await ask(rl, '\nWrite this to the encrypted store? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Cancelled. Nothing was written.');
      return;
    }

    storeCredentials(cardDetails, key);

    // Read it straight back so a silent encryption problem surfaces now
    // rather than during a refill.
    const readBack = loadCredentials(key);
    if (!readBack || readBack.CCNumber !== number) {
      console.error('Stored file did not read back correctly. Do not rely on refill until this is resolved.');
      process.exit(1);
    }

    console.log('\nStored and verified. Refill should now work:');
    console.log('  Admin panel -> Balance -> Refill, or POST /api/admin/balance/refill');
    console.log('Note: auto-refill is a separate toggle in balance settings.');
  } finally {
    rl.close();
  }
}

const mode = process.argv[2];
const run = mode === '--verify' ? verify : store;

run().catch((e) => {
  console.error('Failed: ' + e.message);
  process.exit(1);
});
