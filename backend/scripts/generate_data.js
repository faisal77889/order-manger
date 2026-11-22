import fs from 'fs';
import path from 'path';
import { faker } from '@faker-js/faker';


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


  console.log('Generating categories.csv...');
  const catStream = fs.createWriteStream(path.join(OUT_DIR, 'categories.csv'));
  await writeLine(catStream, 'id,name');

  const validCategoryIds = [];
  for (let i = 1; i <= NUM_CATEGORIES; i++) {
    let name = `${faker.commerce.department()} ${i}`; 
    const isBadRow = i > 1 && Math.random() < BAD_ROW_RATE;

    if (isBadRow) {
      name = ''; 
    } else {
      validCategoryIds.push(i);
    }

    await writeLine(catStream, `${i},${csvEscape(name)}`);
  }
  await closeStream(catStream);


  console.log('Generating products.csv...');
  const prodStream = fs.createWriteStream(path.join(OUT_DIR, 'products.csv'));
  await writeLine(prodStream, 'id,category_id,name,price');

  const productPrices = new Int32Array(NUM_PRODUCTS + 1);
  const validProductIds = [];

  for (let i = 1; i <= NUM_PRODUCTS; i++) {
    let categoryId = pickRandom(validCategoryIds);
    let name = faker.commerce.productName();

    let price = Math.floor(Math.random() * 500) + 5;
    productPrices[i] = price;

    const isBadRow = i > 1 && Math.random() < BAD_ROW_RATE;
    if (isBadRow) {
      const errType = Math.floor(Math.random() * 3);
      if (errType === 0) {
        price = -price; 
      } else if (errType === 1) {
        categoryId = 999999; 
      } else {
        name = ''; 
      }
    } else {
      validProductIds.push(i);
    }

    await writeLine(prodStream, `${i},${categoryId},${csvEscape(name)},${price}`);
  }
  await closeStream(prodStream);


  console.log('Generating customers.csv...');
  const custStream = fs.createWriteStream(path.join(OUT_DIR, 'customers.csv'));
  await writeLine(custStream, 'id,name,email,city,created_at');

  const validCustomerIds = [];
  for (let i = 1; i <= NUM_CUSTOMERS; i++) {
    const name = faker.person.fullName();
    let email = `user${i}_${faker.internet.email().toLowerCase()}`; 
    let city = faker.location.city();
    const createdAt = randomDateLast2Years();

    const isBadRow = i > 1 && Math.random() < BAD_ROW_RATE;
    if (isBadRow) {
      if (Math.random() < 0.5) {
        email = ''; 
      } else {
        city = ''; 
      }
    } else {
      validCustomerIds.push(i);
    }

    await writeLine(custStream, `${i},${csvEscape(name)},${csvEscape(email)},${csvEscape(city)},${createdAt}`);
  }
  await closeStream(custStream);


  console.log('Generating orders.csv and order_items.csv...');
  const orderStream = fs.createWriteStream(path.join(OUT_DIR, 'orders.csv'));
  const itemStream = fs.createWriteStream(path.join(OUT_DIR, 'order_items.csv'));

  await writeLine(orderStream, 'id,customer_id,status,order_date,total_amount');
  await writeLine(itemStream, 'id,order_id,product_id,quantity,unit_price');

  const statuses = ['pending', 'paid', 'shipped', 'cancelled'];
  let itemId = 1;

  for (let orderId = 1; orderId <= NUM_ORDERS; orderId++) {
    const numItems = Math.floor(Math.random() * 4) + 1;
    let validItemsTotal = 0;

    const isBadOrder = Math.random() < BAD_ROW_RATE;
    const orderErrType = isBadOrder ? Math.floor(Math.random() * 4) : -1;

    for (let j = 0; j < numItems; j++) {
      let productId = pickRandom(validProductIds);
      const unitPrice = productPrices[productId];
      let quantity = Math.floor(Math.random() * 5) + 1;


      const canCorruptItem = j > 0 && Math.random() < BAD_ROW_RATE;
      if (canCorruptItem) {
        if (Math.random() < 0.5) {
          quantity = -quantity; 
        } else {
          productId = 9999999; 
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

    if (isBadOrder) {
      if (orderErrType === 0) customerId = 9999999; 
      else if (orderErrType === 1) orderDate = 'not-a-valid-date'; 
      else if (orderErrType === 2) status = 'unknown_status'; 
      else totalAmount = validItemsTotal + 999; 
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
