import fs from 'fs';
import path from 'path';
import { faker } from '@faker-js/faker';

// Parse simple CLI args: node scripts/generate_data.js --orders 200000 --out data
const args = process.argv.slice(2);
const getArg = (flag, defaultVal) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
};

const NUM_CATEGORIES = 50;
const NUM_PRODUCTS = 5000;
const NUM_CUSTOMERS = 20000;
const NUM_ORDERS = parseInt(getArg('--orders', '200000'), 10);
const OUT_DIR = path.resolve(getArg('--out', 'data'));
const BAD_ROW_RATE = 0.01; // 1% bad rows per file

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// Helper to write lines to a stream respecting backpressure
function writeLine(stream, line) {
  return new Promise((resolve) => {
    if (!stream.write(line + '\n')) {
      stream.once('drain', resolve);
    } else {
      resolve();
    }
  });
}

function closeStream(stream) {
  return new Promise((resolve, reject) => {
    stream.end(() => resolve());
    stream.once('error', reject);
  });
}

// Escape CSV fields if they contain commas or quotes
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const TWO_YEARS_AGO = new Date();
TWO_YEARS_AGO.setFullYear(TWO_YEARS_AGO.getFullYear() - 2);
const NOW = new Date();

function randomDateLast2Years() {
  const time = TWO_YEARS_AGO.getTime() + Math.random() * (NOW.getTime() - TWO_YEARS_AGO.getTime());
  return new Date(time).toISOString();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generate() {
  console.time('Data Generation');

  // 1. Categories (~50)
  // Track valid category IDs so products.csv only references valid categories for its 99% good rows
  console.log('Generating categories.csv...');
  const catStream = fs.createWriteStream(path.join(OUT_DIR, 'categories.csv'));
  await writeLine(catStream, 'id,name');

  const validCategoryIds = [];
  for (let i = 1; i <= NUM_CATEGORIES; i++) {
    let name = `${faker.commerce.department()} ${i}`; // ensure uniqueness
    const isBadRow = i > 1 && Math.random() < BAD_ROW_RATE;

    if (isBadRow) {
      name = ''; // ~1% bad row: missing category name
    } else {
      validCategoryIds.push(i);
    }

    await writeLine(catStream, `${i},${csvEscape(name)}`);
  }
  await closeStream(catStream);

  // 2. Products (~5,000)
  // Uses validCategoryIds from categories.csv for 99% valid rows, and tracks validProductIds & prices for order_items.csv
  console.log('Generating products.csv...');
  const prodStream = fs.createWriteStream(path.join(OUT_DIR, 'products.csv'));
  await writeLine(prodStream, 'id,category_id,name,price');

  const productPrices = new Int32Array(NUM_PRODUCTS + 1);
  const validProductIds = [];

  for (let i = 1; i <= NUM_PRODUCTS; i++) {
    let categoryId = pickRandom(validCategoryIds);
    let name = faker.commerce.productName();
    // Use integer prices matching Prisma Int column so order_items sum matches orders.total_amount exactly
    let price = Math.floor(Math.random() * 500) + 5;
    productPrices[i] = price;

    const isBadRow = i > 1 && Math.random() < BAD_ROW_RATE;
    if (isBadRow) {
      const errType = Math.floor(Math.random() * 3);
      if (errType === 0) {
        price = -price; // negative price
      } else if (errType === 1) {
        categoryId = 999999; // non-existent category_id
      } else {
        name = ''; // missing product name
      }
    } else {
      validProductIds.push(i);
    }

    await writeLine(prodStream, `${i},${categoryId},${csvEscape(name)},${price}`);
  }
  await closeStream(prodStream);

  // 3. Customers (~20,000)
  // Tracks validCustomerIds so orders.csv references valid customers for its 99% valid rows
  console.log('Generating customers.csv...');
  const custStream = fs.createWriteStream(path.join(OUT_DIR, 'customers.csv'));
  await writeLine(custStream, 'id,name,email,city,created_at');

  const validCustomerIds = [];
  for (let i = 1; i <= NUM_CUSTOMERS; i++) {
    const name = faker.person.fullName();
    let email = `user${i}_${faker.internet.email().toLowerCase()}`; // guaranteed unique
    let city = faker.location.city();
    const createdAt = randomDateLast2Years();

    const isBadRow = i > 1 && Math.random() < BAD_ROW_RATE;
    if (isBadRow) {
      if (Math.random() < 0.5) {
        email = ''; // missing email
      } else {
        city = ''; // missing city
      }
    } else {
      validCustomerIds.push(i);
    }

    await writeLine(custStream, `${i},${csvEscape(name)},${csvEscape(email)},${csvEscape(city)},${createdAt}`);
  }
  await closeStream(custStream);

  // 4 & 5. Orders (200,000) & Order Items (~500,000)
  // Respects validCustomerIds from customers.csv and validProductIds from products.csv.
  // For the 99% valid orders, all their order_items are guaranteed valid and total_amount === sum(quantity * unit_price).
  console.log('Generating orders.csv and order_items.csv...');
  const orderStream = fs.createWriteStream(path.join(OUT_DIR, 'orders.csv'));
  const itemStream = fs.createWriteStream(path.join(OUT_DIR, 'order_items.csv'));

  await writeLine(orderStream, 'id,customer_id,status,order_date,total_amount');
  await writeLine(itemStream, 'id,order_id,product_id,quantity,unit_price');

  const statuses = ['pending', 'paid', 'shipped', 'cancelled'];
  let itemId = 1;

  for (let orderId = 1; orderId <= NUM_ORDERS; orderId++) {
    // 1 to 4 items per order (averages 2.5 items -> ~500,000 items for 200,000 orders)
    const numItems = Math.floor(Math.random() * 4) + 1;
    let validItemsTotal = 0;

    // Decide upfront if this order row itself will be part of the ~1% bad orders
    const isBadOrder = Math.random() < BAD_ROW_RATE;
    const orderErrType = isBadOrder ? Math.floor(Math.random() * 4) : -1;

    for (let j = 0; j < numItems; j++) {
      let productId = pickRandom(validProductIds);
      const unitPrice = productPrices[productId];
      let quantity = Math.floor(Math.random() * 5) + 1;

      // Only inject ~1% bad rows into order_items if we ensure at least 1 valid item remains on valid orders,
      // and only count valid items toward validItemsTotal so valid orders match sum(quantity * unit_price)
      const canCorruptItem = j > 0 && Math.random() < BAD_ROW_RATE;
      if (canCorruptItem) {
        if (Math.random() < 0.5) {
          quantity = -quantity; // bad quantity (<= 0)
        } else {
          productId = 9999999; // unknown product_id
        }
      } else {
        validItemsTotal += quantity * unitPrice;
      }

      await writeLine(
        itemStream,
        `${itemId},${orderId},${productId},${quantity},${unitPrice}`
      );
      itemId++;
    }

    let customerId = pickRandom(validCustomerIds);
    let status = pickRandom(statuses);
    let orderDate = randomDateLast2Years();
    let totalAmount = validItemsTotal;

    // ~1% bad row in orders: unknown customer_id, invalid status, bad date, or mismatched total_amount
    if (isBadOrder) {
      if (orderErrType === 0) customerId = 9999999; // unknown customer_id
      else if (orderErrType === 1) orderDate = 'not-a-valid-date'; // wrong date format
      else if (orderErrType === 2) status = 'unknown_status'; // invalid enum status
      else totalAmount = validItemsTotal + 999; // total_amount mismatch with sum(quantity * unit_price)
    }

    await writeLine(
      orderStream,
      `${orderId},${customerId},${status},${orderDate},${totalAmount}`
    );
  }

  await closeStream(orderStream);
  await closeStream(itemStream);

  console.log(`Done! Generated ${NUM_ORDERS} orders and ${itemId - 1} order items in ${OUT_DIR}`);
  console.timeEnd('Data Generation');
}

generate().catch(console.error);
