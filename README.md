# 🧠 Corporate Brain - AI Compliance Guardian

> **Adobe Express Add-on** that prevents compliance errors **while you design**.

Built for Adobe Express Hackathon 🚀

---

## 📋 What It Does

Imagine a designer writes: *"Our new phone is 100% waterproof."*

But legally, the phone is only **water-resistant**. Usually, this mistake isn't caught until Legal reviews it weeks later, forcing a total redesign.

**Corporate Brain** catches these issues **instantly** and suggests compliant alternatives.

---

## 🏗️ Architecture

```
my-addon/
├── src/                          # Adobe Express Add-on (React + TypeScript)
│   ├── components/
│   │   ├── App.tsx               # Main UI panel
│   │   └── App.css               # Styles
│   ├── index.tsx                 # SDK bootstrap
│   └── manifest.json             # Add-on manifest
│
├── server/                       # Backend API (Express + Prisma + PostgreSQL)
│   ├── prisma/
│   │   ├── schema.prisma         # Database models
│   │   └── seed.js               # Demo data seeder
│   ├── src/
│   │   ├── index.js              # Express server entry
│   │   ├── lib/
│   │   │   └── prisma.js         # Prisma client singleton
│   │   ├── routes/
│   │   │   ├── compliance.js     # POST /api/compliance/check
│   │   │   ├── documents.js      # Document upload endpoints
│   │   │   └── rules.js          # Policy rules CRUD
│   │   └── services/
│   │       ├── complianceChecker.js  # Keyword-based checker
│   │       └── vectorStore.js        # RAG placeholder
│   └── package.json
│
└── README.md
```

---

## 🚀 Quick Start (Step-by-Step)

### Prerequisites

- **Node.js 18+** with npm
- **PostgreSQL** running locally (or use Docker)
- **OpenSSL** in PATH (for Adobe dev SSL cert)

---

### Step 1: Install PostgreSQL

**Option A: Using Docker (easiest)**
```bash
docker run --name corporate-brain-db -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15
```

**Option B: Install locally**
- Download from https://www.postgresql.org/download/
- Default port: 5432
- Create a database called `corporate_brain`

---

### Step 2: Setup the Backend Server

```bash
# Navigate to server folder
cd server

# Install dependencies
npm install

# Create .env file (copy from example)
copy env.example .env
# Or on Mac/Linux: cp env.example .env

# Update .env with your PostgreSQL credentials:
# DATABASE_URL="postgresql://postgres:password@localhost:5432/corporate_brain"

# Generate Prisma client
npm run db:generate

# Push schema to database (creates tables)
npm run db:push

# Seed demo compliance rules
npm run db:seed

# Start the server (with hot-reload)
npm run dev
```

Server runs at **http://localhost:4000**

---

### Step 3: Setup the Adobe Express Add-on

```bash
# Navigate back to project root
cd ..

# Install dependencies
npm install

# Setup SSL certificate (required for Adobe Express)
npx @adobe/ccweb-add-on-ssl setup --hostname localhost

# Start the add-on dev server
npm run start
```

Add-on hosts at **https://localhost:5241**

---

### Step 4: Load in Adobe Express

1. Go to [Adobe Express](https://new.express.adobe.com)
2. Click **Add-ons** (left sidebar)
3. Click **Your add-ons** tab
4. Under **Add-on Development**, enable **Add-on testing**
5. Click **Connect to development server**
6. Enter: `https://localhost:5241`
7. Check the risk acknowledgment box
8. Click **Connect**

Your add-on should now appear in the panel! 🎉

---

## 🧪 Test It

Type this in the add-on panel:

> *"Our new phone is 100% waterproof and guaranteed to never fail."*

Click **Check Compliance** and see:
- 3 compliance issues detected
- Severity levels (HIGH, MEDIUM, LOW)
- Suggested compliant rewrite

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health check |
| `POST` | `/api/compliance/check` | Check text for compliance issues |
| `GET` | `/api/compliance/stats` | Get compliance check statistics |
| `POST` | `/api/documents/upload` | Upload a "truth source" document |
| `GET` | `/api/documents` | List all uploaded documents |
| `DELETE` | `/api/documents/:id` | Delete a document |
| `GET` | `/api/rules` | List all policy rules |
| `POST` | `/api/rules` | Create a new rule |
| `PUT` | `/api/rules/:id` | Update a rule |
| `DELETE` | `/api/rules/:id` | Delete a rule |

### Example: Check Compliance

```bash
curl -X POST http://localhost:4000/api/compliance/check \
  -H "Content-Type: application/json" \
  -d '{"text": "Our phone is 100% waterproof and guaranteed to never fail."}'
```

---

## 📋 Demo Compliance Rules

The seed script adds these built-in rules:

| Pattern | Severity | Suggestion |
|---------|----------|------------|
| `100% waterproof` | HIGH | water-resistant (IP67 rated) |
| `waterproof` | MEDIUM | water-resistant |
| `guaranteed` | MEDIUM | designed to |
| `never fails` | HIGH | highly reliable |
| `cures` | HIGH | may help with |
| `best in class` | LOW | industry-leading |
| `scientifically proven` | HIGH | backed by research |
| `unlimited` | MEDIUM | extensive |
| `free` | MEDIUM | included at no extra cost |
| `safe for all ages` | MEDIUM | suitable for most users |

---

## 🔮 Adding RAG (Future Enhancement)

The `server/src/services/vectorStore.js` is a placeholder. To enable RAG:

1. **Choose a vector database**: Pinecone, Weaviate, Qdrant, pgvector
2. **Implement the VectorStore class methods**:
   - `connect()` - Initialize DB connection
   - `indexDocument(docId, text)` - Chunk → Embed → Store
   - `search(query, topK)` - Embed query → Find similar chunks
3. **Update complianceChecker.js** to use semantic search
4. **Add LLM integration** (OpenAI, Claude) to analyze context

---

## 🛠️ Troubleshooting

### "Could not locate a valid SSL certificate"
```bash
npx @adobe/ccweb-add-on-ssl setup --hostname localhost
```

### "OpenSSL not found"
Add Git's OpenSSL to PATH:
```powershell
$env:Path += ";C:\Program Files\Git\usr\bin"
```

### "Cannot connect to database"
1. Make sure PostgreSQL is running
2. Check your `.env` file has correct `DATABASE_URL`
3. Run `npm run db:push` to create tables

### "CORS error in browser"
The server has CORS enabled for all origins. If issues persist, check the browser console for details.

---

## 🛠️ Tech Stack

- **Add-on**: React 18, TypeScript, Spectrum Web Components
- **Backend**: Node.js, Express.js, Prisma ORM
- **Database**: PostgreSQL
- **Future**: Vector DB (Pinecone/Weaviate), OpenAI/Claude for RAG

---

## 📁 File Structure Quick Reference

```
server/
├── prisma/
│   ├── schema.prisma    ← Database models (Document, PolicyRule, ComplianceCheck)
│   └── seed.js          ← Seeds demo compliance rules
├── src/
│   ├── index.js         ← Express server setup + routes
│   ├── lib/prisma.js    ← Prisma client singleton
│   ├── routes/
│   │   ├── compliance.js ← POST /api/compliance/check
│   │   ├── documents.js  ← Document upload/list/delete
│   │   └── rules.js      ← Policy rules CRUD
│   └── services/
│       ├── complianceChecker.js ← Keyword matching logic
│       └── vectorStore.js       ← RAG placeholder (stub)
└── package.json
```

---

## 📜 License

MIT

---

**Built with ❤️ for Adobe Express Hackathon**
