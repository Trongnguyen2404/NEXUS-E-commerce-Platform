# 🚀 NEXUS - Premium E-commerce Platform

[![Demo Video](https://img.shields.io/badge/YouTube-Watch%20Demo-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/J4CwT2gmTT8)
[![NestJS](https://img.shields.io/badge/nestjs-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white)](#)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)](#)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](#)
[![PostgreSQL](https://img.shields.io/badge/postgresql-4169e1?style=for-the-badge&logo=postgresql&logoColor=white)](#)
[![Stripe](https://img.shields.io/badge/Stripe-626CD9?style=for-the-badge&logo=Stripe&logoColor=white)](#)

A high-performance, full-stack e-commerce platform built with **NestJS** and **React**. Designed with a focus on robust backend architecture, data integrity, and a seamless user experience.

## 🎥 Video Demo

Click the image below to watch the full system demonstration on YouTube:

[![NEXUS Demo Video](https://img.youtube.com/vi/J4CwT2gmTT8/maxresdefault.jpg)](https://youtu.be/J4CwT2gmTT8)

*Video Title: NEXUS – Premium E-commerce Platform | Fullstack Demo (NestJS, React, Stripe, JWT Auth)*

---

## ✨ Key Features

### 🛡️ Backend (NestJS & Prisma)
* **Advanced Authentication:** JWT-based authentication with 15-minute Access Tokens and 7-day Refresh Tokens rotation mechanism.
* **Role-Based Access Control (RBAC):** Strict route protection using Custom Guards to separate `ADMIN` and `USER` privileges.
* **Data Integrity & Transactions:** Utilized **Prisma Transactions** during the checkout process to ensure atomic operations (syncing stock decrement with order creation).
* **Secure Payments:** Integrated **Stripe API** for handling secure credit card transactions and status updates.
* **API Security:** Implemented `@nestjs/throttler` for Rate Limiting to prevent brute-force attacks and spam.

### 💻 Frontend (React & Tailwind CSS)
* **Smart Axios Interceptors:** Built a custom request queueing system to handle concurrent API calls when the access token expires, silently refreshing the token without interrupting the user experience.
* **Admin Dashboard:** Features auto-SKU generation, live image previews, and dynamic order status management.
* **State Management:** Utilized **Zustand** for lightweight and scalable global state management.
* **High-Contrast UI:** Designed a modern, premium user interface with Tailwind CSS.

---

## 🛠️ Technology Stack

**Backend:**
* Framework: Node.js, NestJS
* Database: PostgreSQL, Prisma ORM
* Security: Bcrypt, Passport-JWT, NestJS Throttler
* Payments: Stripe API

**Frontend:**
* Core: React.js, TypeScript
* Styling: Tailwind CSS, Lucide-React (Icons)
* State Management: Zustand
* HTTP Client: Axios

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+ recommended)
* PostgreSQL installed and running
* Stripe Account (for API keys)

### 1. Clone the repository
```bash
git clone [https://github.com/Trongnguyen2404/NEXUS-E-commerce-Platform.git](https://github.com/Trongnguyen2404/NEXUS-E-commerce-Platform.git)
cd NEXUS-E-commerce-Platform
```

### 2. Backend setup

```bash
cd server
npm install                 # runs `prisma generate` automatically via postinstall
cp .env.example .env        # then fill in DATABASE_URL, JWT secrets, Stripe keys
npx prisma migrate deploy   # create the tables
npm run seed                # create the first ADMIN account + sample catalog
npm run start:dev
```

The API runs at `http://localhost:3000/api/v1`, Swagger UI at `http://localhost:3000/api/docs`
(Swagger is disabled automatically when `NODE_ENV=production`).

`npm run seed` prints the admin credentials it created — they come from
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in your `.env`. Re-running it is safe;
it updates the existing admin instead of creating duplicates.

### 3. Stripe webhook (required for payments)

Card charges are confirmed server-side through a webhook, so an interrupted
browser never leaves a paid order stuck as unpaid. In development, forward
events with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/v1/payments/webhook
```

Copy the `whsec_...` secret it prints into `STRIPE_WEBHOOK_SECRET` in `server/.env`.

### 4. Frontend setup

```bash
cd client
npm install
cp .env.example .env        # then fill in VITE_API_URL and the Stripe publishable key
npm run dev
```

The app runs at `http://localhost:5173`. Make sure that origin is listed in
`ALLOWED_ORIGINS` in `server/.env` — the refresh token is delivered as a
credentialed cookie, which CORS rejects for unlisted origins.

### Run everything with Docker instead

```bash
cp server/.env.example server/.env    # fill in the Stripe keys at minimum
docker compose up --build
```

This starts PostgreSQL, applies migrations, seeds the admin account, and serves
the API on `:3000` and the frontend on `:5173`.

---

## 🔐 Security notes

* **Access token** (15 min) is held in `localStorage`; the **refresh token** (7 days)
  is delivered as an `httpOnly`, path-scoped cookie so no script can read it.
* Order status can only be changed by an `ADMIN`. Customers may correct their
  shipping address, and only while the order is still `PENDING`.
* Payments are confirmed from the Stripe webhook (signature-verified and
  idempotent), not from the browser callback.
* Rate limiting: 5 requests/minute on auth endpoints, 100/minute elsewhere, per IP.

---

## 📜 Available scripts

**server/**

| Script | What it does |
| --- | --- |
| `npm run start:dev` | Watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm run seed` | Create/refresh the ADMIN account and sample catalog |
| `npm run lint` | ESLint with `--fix` |

**client/**

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
