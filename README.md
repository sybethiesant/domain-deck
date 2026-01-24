# WorxTech - Domain Reseller Storefront

A full-featured e-commerce domain reseller storefront powered by the eNom API. Built with React and Node.js.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

### Customer Features
- **Domain Search** - Real-time availability checking with suggestions
- **Shopping Cart** - Multi-domain cart with persistent storage
- **Secure Checkout** - Stripe payment processing
- **Customer Dashboard** - Manage domains, nameservers, WHOIS contacts
- **Domain Management** - Auto-renew, transfer lock, privacy protection
- **Two-Factor Authentication** - TOTP-based 2FA with backup codes
- **DNS & URL Forwarding** - Manage DNS records and URL redirects

### Admin Features
- **Dashboard** - Revenue stats, order overview, domain status
- **User Management** - View/edit users, assign roles, security controls
- **Order Management** - Process orders, handle refunds
- **Domain Management** - Sync from eNom, manage all domains
- **TLD Pricing** - Configure pricing with markup, sync from eNom
- **Site Settings** - Logo, maintenance mode, email templates
- **Role-Based Access** - 5-tier permission system
- **Audit Logs** - Track all admin actions

### Integrations
- **eNom API** - Domain registration, transfers, management
- **Stripe** - Payment processing with saved cards for auto-renewal
- **Email** - Configurable SMTP for transactional emails

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 19, Tailwind CSS, Lucide Icons |
| Backend | Node.js, Express 5, PostgreSQL |
| Payments | Stripe |
| Domain API | eNom Reseller API |
| Authentication | JWT with 2FA (TOTP) |
| Deployment | Docker |

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- eNom Reseller Account
- Stripe Account

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/sybethiesant/worxtech-store.git
   cd worxtech-store
   ```

2. **Configure environment**
   ```bash
   cp backend/.env.example backend/.env
   # Edit .env with your credentials
   ```

3. **Install dependencies**
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

4. **Initialize database**
   ```bash
   psql -U postgres -f backend/schema.sql
   ```

5. **Start development servers**
   ```bash
   # Backend (port 5001)
   cd backend && npm run dev

   # Frontend (port 3000)
   cd frontend && npm start
   ```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DB_HOST` | PostgreSQL host |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `JWT_SECRET` | Secret for JWT signing |
| `ENOM_ENV` | `test` or `production` |
| `ENOM_UID` | eNom username |
| `ENOM_PW` | eNom password |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |

### eNom Setup

1. Create an eNom reseller account at [enom.com](https://www.enom.com)
2. Get API credentials from your reseller dashboard
3. Use OTE (test) environment for development
4. Switch to production when ready to go live

### Stripe Setup

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Get API keys from Developers → API keys
3. Configure webhook endpoint: `https://yourdomain.com/api/stripe/webhook`
4. Add webhook events: `payment_intent.succeeded`, `payment_intent.payment_failed`

## Docker Deployment

### Using Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5001:5001"
      - "3001:3001"
    environment:
      - DB_HOST=db
      - DB_NAME=worxtech
      - DB_USER=worxtech
      - DB_PASSWORD=${DB_PASSWORD}
    depends_on:
      - db

  db:
    image: postgres:15
    volumes:
      - db-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=worxtech
      - POSTGRES_USER=worxtech
      - POSTGRES_PASSWORD=${DB_PASSWORD}

volumes:
  db-data:
```

### PM2 Process Management

The application uses PM2 for process management:

```bash
# Start services
pm2 start ecosystem.config.js

# View status
pm2 list

# View logs
pm2 logs worxtech-api
```

## Backup & Recovery

Backup scripts are included for disaster recovery:

```bash
# Create backup (run from host)
sudo ./backend/scripts/backup-host.sh

# Restore from backup
sudo ./backend/scripts/restore-host.sh /path/to/backup.tar.gz
```

Backups include:
- PostgreSQL database dump
- Environment configuration
- Uploaded assets

## Project Structure

```
├── backend/
│   ├── routes/           # API endpoints
│   │   ├── admin/        # Admin panel routes
│   │   ├── auth.js       # Authentication
│   │   ├── domains.js    # Domain operations
│   │   └── ...
│   ├── services/         # Business logic
│   │   ├── enom.js       # eNom API wrapper
│   │   ├── stripe.js     # Stripe integration
│   │   └── ...
│   ├── middleware/       # Express middleware
│   └── scripts/          # Utility scripts
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   └── config/       # Configuration
│   └── public/
└── ecosystem.config.js   # PM2 configuration
```

## API Documentation

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Sign in |
| `/api/auth/me` | GET | Get current user |
| `/api/auth/2fa/setup` | POST | Setup 2FA |

### Domains
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/domains/check/:domain` | GET | Check availability |
| `/api/domains` | GET | List user's domains |
| `/api/domains/:id/nameservers` | PUT | Update nameservers |

### Admin
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/stats` | GET | Dashboard statistics |
| `/api/admin/users` | GET | List users |
| `/api/admin/orders` | GET | List orders |

## Security

- All passwords hashed with bcrypt (cost 12)
- JWT tokens with configurable expiration
- Rate limiting on authentication endpoints
- CSRF protection
- SQL injection prevention (parameterized queries)
- XSS protection via React
- Role-based access control

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/sybethiesant/worxtech-store/issues) page.
