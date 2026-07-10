# Addonez API

Backend API for the Addonez ERP Mobile Application. This project integrates with Odoo ERP and provides REST APIs for authentication, dashboard, finance, sales, CRM, manufacturing, projects, accounts, analytics, and profile management.

---

## Prerequisites

Before running the project, install:

- Node.js (v18 or later)
- npm
- Git
- Odoo ERP Server (running and accessible)

---

## Clone Repository

```bash
git clone https://github.com/addonez-org/addonez-api.git
cd addonez-api
```

---

## Install Dependencies

```bash
npm install
```

---

## Environment Configuration

Create a `.env` file in the project root.

Example:

```env
BOOTSTRAP_ODOO_HOST=
BOOTSTRAP_ODOO_PORT=
BOOTSTRAP_ODOO_SSL=
BOOTSTRAP_ODOO_DB=
BOOTSTRAP_ODOO_USERNAME=
BOOTSTRAP_ODOO_PASSWORD=

JWT_SECRET=
JWT_EXPIRES_IN=7d

PORT=5000
NODE_ENV=development
```

> Do not commit real credentials or secrets to the repository.

---

## Run the Backend

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

---

## Project Structure

```
src/
├── config/
├── controllers/
├── middleware/
├── routes/
├── utils/
└── server.js

scripts/
```

---

## Available Modules

- Authentication
- Dashboard
- Finance
- Sales
- CRM
- Manufacturing
- Projects
- Accounts
- Analytics
- Profile
- Odoo ERP Integration

---

## API Authentication

Most protected endpoints require a JWT token.

Include the token in the request header:

```text
Authorization: Bearer <JWT_TOKEN>
```

---

## Backend Configuration

Configure the Odoo ERP connection using the values in the `.env` file.

The backend uses these configuration files:

- `src/config/bootstrap.js`
- `src/config/odooClient.js`
- `src/config/OdooConfigService.js`
- `src/config/OdooService.js`

---

## Utility Scripts

Available scripts inside the `scripts/` folder:

```bash
node scripts/check-dashboard-data.js
node scripts/check-account-summary.js
node scripts/reset-project.js
```

---

## Notes

- Install dependencies before running the server.
- Ensure the Odoo ERP server is running and reachable.
- Configure the required environment variables in `.env`.
- Use `.env.example` as a reference when setting up a new environment.