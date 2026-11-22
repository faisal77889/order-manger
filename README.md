# Order Manager

A full-stack Order Management System built with **Express.js**, **PostgreSQL (Prisma ORM)**, **Redis + BullMQ** on the backend, and **React + TypeScript + Tailwind CSS + Vite** on the frontend.

> **Note:** I am still working on some features and performance optimizations for this project.

---

## Tech Stack

- **Backend**: Node.js, Express 5, PostgreSQL, Prisma ORM, Redis, BullMQ (background CSV import worker), JWT & bcrypt authentication
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, React Router DOM, Axios

---

## Prerequisites

Make sure you have the following installed and running locally:
- **Node.js** (v20+ recommended)
- **PostgreSQL** (>= 15)
- **Redis** (required for BullMQ CSV import queue)

---

## Project Setup

### 1. Backend Setup

1. Navigate to the `backend` folder and install dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Configure environment variables in `backend/.env`:
   ```env
   DATABASE_URL="postgresql://postgres:admin@localhost:5432/order_manager"
   JWT_SECRET="your_jwt_secret_key"
   REDIS_HOST="127.0.0.1"
   REDIS_PORT=6379
   ```

3. Run Prisma migrations / contract emit if setting up the database for the first time:
   ```bash
   npx prisma migrate dev
   npm run contract:emit
   ```

4. *(Optional)* Generate sample CSV dataset:
   ```bash
   npm run generate-data
   ```

5. Start the backend server (runs on `http://localhost:3000`):
   ```bash
   node src/app.js
   ```

---

### 2. Frontend Setup

1. Open a new terminal, navigate to the `frontend` folder, and install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. *(Optional)* Configure `frontend/.env` (defaults to `http://localhost:3000`):
   ```env
   VITE_API_BASE_URL=http://localhost:3000
   ```

3. Start the Vite development server (runs on `http://localhost:5173`):
   ```bash
   npm run dev
   ```

---

## Available Features

- **Authentication (`/login`)**: JWT-based admin/viewer sign-in and route protection.
- **Orders (`/orders` & `/orders/:id`)**: Paginated order listing with debounced customer search, status filter, date range filter, sorting, and detailed order breakdown view.
- **Customer Orders (`/customers` & `/customers/:id`)**: Filterable order history per customer.
- **Bulk CSV Import (`/import`)**: Drag-and-drop CSV upload (`categories`, `products`, `customers`, `orders`, `order_items`) queued via BullMQ with live status checking and error CSV downloads.
- **CSV Export (`/export`)**: Streamed CSV downloads of filtered orders.
- **Reports & Analytics (`/reports`)**: Monthly sales trend, sales by category, top customers, and never-ordered products.
- **Audit Logs (`/audit`)**: Filterable administrative activity trail.

---

## Work in Progress

I am still working on some features, such as database indexing, analyzing the performance differences in SQL query outputs (`EXPLAIN ANALYZE` before and after indexing), and refining the reports and analytics further.
