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
