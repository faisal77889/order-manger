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

## Project Setup (3 Commands Total)

1. Configure environment variables in `backend/.env`:
   ```env
   DATABASE_URL="postgresql://postgres:admin@localhost:5432/order_manager"
   JWT_SECRET="your_jwt_secret_key"
   REDIS_HOST="127.0.0.1"
   REDIS_PORT=6379
   ```
   *(Optional)* Configure `frontend/.env` (defaults to `http://localhost:3000`):
   ```env
   VITE_API_BASE_URL=http://localhost:3000
   ```

2. From the project root (`order_manager/`), install all dependencies (backend + frontend), run database migrations, and emit the Prisma contract in one command:
   ```bash
   npm run setup
   ```

3. Start the Backend server (`http://localhost:3000`) and Frontend dev server (`http://localhost:5173`):
   ```bash
   # Terminal 1 — Start Backend
   npm run dev:backend

   # Terminal 2 — Start Frontend
   npm run dev:frontend
   ```

*(Optional)* To generate sample CSV data:
```bash
npm run generate-data
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
