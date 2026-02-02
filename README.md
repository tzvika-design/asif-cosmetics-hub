# Asif Cosmetics Hub

Central API hub for **ENIGMA Parfume** and **Asif Cosmetics** - managing perfume formulation, inventory, orders, and customer communications.

## Features

- **Claude AI Integration** - Perfume analysis, formula generation, customer support
- **Shopify Integration** - Orders, products, inventory management
- **Meta Integration** - WhatsApp Business, Facebook, Instagram
- **Webhook Support** - Real-time updates from all platforms

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your API keys
# Then start the server
npm run dev
```

## Project Structure

```
asif-cosmetics-hub/
├── src/
│   ├── server.js          # Express server entry point
│   ├── routes/
│   │   ├── api.js         # Main API routes
│   │   ├── agents.js      # AI agent routes
│   │   └── webhooks.js    # Webhook handlers
│   ├── services/
│   │   ├── claude.js      # Claude API service
│   │   ├── shopify.js     # Shopify API service
│   │   └── meta.js        # Meta (WhatsApp/FB/IG) service
│   ├── agents/
│   │   ├── perfumeAgent.js    # Perfume AI agent
│   │   ├── customerAgent.js   # Customer support agent
│   │   └── inventoryAgent.js  # Inventory management agent
│   ├── middleware/
│   ├── config/
│   └── utils/
├── public/                # Static files
├── .env.example          # Environment template
├── .gitignore
├── package.json
└── README.md
```

## API Endpoints

### Core API (`/api`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/perfumes` | List all perfumes |
| POST | `/api/perfumes/analyze` | Analyze a perfume |
| GET | `/api/formulas` | List all formulas |
| POST | `/api/formulas/generate` | Generate a formula |
| GET | `/api/orders` | Get Shopify orders |

### AI Agents (`/agents`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/perfume/analyze` | Perfume analysis |
| POST | `/agents/perfume/recommend` | Get recommendations |
| POST | `/agents/customer/chat` | Customer chat |
| GET | `/agents/inventory/status` | Inventory status |
| GET | `/agents/inventory/alerts` | Inventory alerts |

### Webhooks (`/webhooks`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/shopify/orders/create` | New order webhook |
| POST | `/webhooks/meta` | Meta platform events |
| POST | `/webhooks/whatsapp` | WhatsApp messages |

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Claude API
CLAUDE_API_KEY=sk-ant-...

# Shopify
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...

# Meta
META_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```

## Deployment (Railway)

1. Push to GitHub
2. Connect repo to Railway
3. Set environment variables in Railway dashboard
4. Deploy!

```bash
# Railway CLI (optional)
railway login
railway link
railway up
```

## License

MIT - Asif Cosmetics / ENIGMA Parfume
