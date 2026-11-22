const fs = require('fs');
const path = require('path');
const { faker } = require('@faker-js/faker');

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
const BAD_ROW_RATE = 0.01; // 1% bad rows

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

async function generate() {
  console.time('Data Generation');

  // 1. Categories (~50)
  console.log('Generating categories.csv...');
  const catStream = fs.createWriteStream(path.join(OUT_DIR, 'categories.csv'));
  await writeLine(catStream, 'id,name');
  for (let i = 1; i <= NUM_CATEGORIES; i++) {
    const name = `${faker.commerce.department()} ${i}`; // ensure uniqueness
    await writeLine(catStream, `${i},${csvEscape(name)}`);
  }
  catStream.end();

  // 2. Products (~5,000)
  console.log('Generating products.csv...');
  const prodStream = fs.createWriteStream(path.join(OUT_DIR, 'products.csv'));
  await writeLine(prodStream, 'id,category_id,name,price');
  const productPrices = new Float64Array(NUM_PRODUCTS + 1);

  for (let i = 1; i <= NUM_PRODUCTS; i++) {
    const categoryId = Math.floor(Math.random() * NUM_CATEGORIES) + 1;
    const name = faker.commerce.productName();
    let price = parseFloat((Math.random() * 500 + 5).toFixed(2));
    productPrices[i] = price;

    // ~1% bad row: negative price or invalid category_id
    if (Math.random() < BAD_ROW_RATE) {
      price = -price;
    }
    await writeLine(prodStream, `${i},${categoryId},${csvEscape(name)},${price}`);
  }
  prodStream.end();

  // 3. Customers (~20,000)
  console.log('Generating customers.csv...');
  const custStream = fs.createWriteStream(path.join(OUT_DIR, 'customers.csv'));
  await writeLine(custStream, 'id,name,email,city,created_at');
  for (let i = 1; i <= NUM_CUSTOMERS; i++) {
    const name = faker.person.fullName();
    let email = `user${i}_${faker.internet.email().toLowerCase()}`; // guaranteed unique
    const city = faker.location.city();
    const createdAt = randomDateLast2Years();

    // ~1% bad row: missing email
    if (Math.random() < BAD_ROW_RATE) {
      email = '';
    }
    await writeLine(custStream, `${i},${csvEscape(name)},${csvEscape(email)},${csvEscape(city)},${createdAt}`);
  }
  custStream.end();

  // 4 & 5. Orders (200,000) & Order Items (~500,000)
  // Generated together so orders.total_amount matches sum(quantity * unit_price)
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
    let orderTotal = 0;

    for (let j = 0; j < numItems; j++) {
      const productId = Math.floor(Math.random() * NUM_PRODUCTS) + 1;
      const unitPrice = productPrices[productId];
      let quantity = Math.floor(Math.random() * 5) + 1;

      orderTotal += quantity * unitPrice;

      // ~1% bad row in order_items: negative or zero quantity
      if (Math.random() < BAD_ROW_RATE) {
        quantity = -quantity;
      }

      await writeLine(
        itemStream,
        `${itemId},${orderId},${productId},${quantity},${unitPrice.toFixed(2)}`
      );
      itemId++;
    }

    let customerId = Math.floor(Math.random() * NUM_CUSTOMERS) + 1;
    let status = statuses[Math.floor(Math.random() * statuses.length)];
    let orderDate = randomDateLast2Years();

    // ~1% bad row in orders: unknown customer_id, invalid status, or bad date
    if (Math.random() < BAD_ROW_RATE) {
      const errType = Math.floor(Math.random() * 3);
      if (errType === 0) customerId = 9999999; // unknown customer_id
      else if (errType === 1) orderDate = 'not-a-valid-date'; // wrong date format
      else status = 'unknown_status'; // invalid enum status
    }

    await writeLine(
      orderStream,
      `${orderId},${customerId},${status},${orderDate},${orderTotal.toFixed(2)}`
    );
  }

  orderStream.end();
  itemStream.end();

  console.log(`Done! Generated ${NUM_ORDERS} orders and ${itemId - 1} order items in ${OUT_DIR}`);
  console.timeEnd('Data Generation');
}

generate().catch(console.error);