# Groww SIP Discovery AI Engine 🚀

An AI-powered Natural Language Discovery Engine that analyzes public investor feedback to uncover the root causes of first-time mutual fund investor attrition 12 months after SIP initiation on Groww.

Built on an **evidence-first problem space formulation** framework, this engine ingests unfiltered customer reviews, maps investor friction across journey stages, verifies AI classifications via Human-in-the-Loop (HITL) workflows, models causal dynamics via interactive force-directed graphs, and prioritizes high-leverage product interventions.

---

## 🎯 Primary Business Objective
> **Fellowship Metric:** Increase the percentage of first-time mutual fund investors who maintain an **Active SIP** (≥1 successful instalment in the past 30 days) at month 12 after inception.

---

## ✨ Key Features

- **Multi-Source Evidence Ingestion & Provenance:**
  - Ingests and parses real feedback from Google Play Store, Apple App Store, Reddit (`r/IndiaInvestments`), X/Twitter, and SEBI SCORES complaints.
  - Computes cryptographic SHA-256 content hashes to prevent duplicates.
  - Distinguishes between real investor feedback and verified synthetic benchmark data.

- **AI Extraction Engine (Gemini 2.5 Flash + Deterministic Fallback):**
  - Classifies evidence into granular **Journey Stages** (*Discovery & Intent*, *Mandate & KYC Setup*, *First Instalment Allotment*, *Market Dip Reaction*, *Autopay Failure & Recovery*, *Continuation Milestone*, *Pause & Cancellation*).
  - Extracts emotional valence, operational failure mechanisms, friction themes, and user quote verification.

- **Human-in-the-Loop (HITL) Validation & Reliability:**
  - Review interface for product managers and analysts to **Confirm**, **Correct**, or **Reject** AI classifications.
  - Calculates inter-rater agreement rates, tracks disagreement distribution, and flags drift against a golden benchmark test suite.

- **Interactive Causal Force-Directed Graph:**
  - D3-powered force graph modeling relationships between Journey Stages, Friction Themes, Root Failure Mechanisms, and the 12-Month Active SIP metric.
  - Interactive stage filters, drag-and-drop nodes, and live inspection drawer.

- **Opportunity Scoring & PRD Export:**
  - ICE (Impact, Confidence, Ease) prioritization matrix for candidate solutions.
  - Auto-generates structured, evidence-backed Product Requirement Documents (PRDs) with direct investor quote citations.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (Turbopack, App Router, React 19)
- **Language:** TypeScript
- **Database:** SQLite / LibSQL with [Drizzle ORM](https://orm.drizzle.team)
- **AI / LLM:** Google Gen AI SDK (`@google/genai` / Gemini 2.5 Flash)
- **Visualizations:** D3 Force (`d3-force`)
- **Testing:** Vitest
- **Styling:** Custom modern dark-mode fintech design system

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18+ or 20+
- npm, pnpm, or yarn

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/shubhamnaik25081999-gif/groww_sip_discovery_AI_engine.git
cd groww_sip_discovery_AI_engine

# Install dependencies
npm install
```

### 3. Environment Variables (Optional)
Create a `.env.local` file in the root directory:
```env
# Gemini API Key (optional - system uses deterministic offline fallback if not provided)
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Push Database Schema
```bash
npm run db:push
```

### 5. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Run Test Suite
```bash
npm test
```

---

## ☁️ Deploying to Vercel

1. **Import Project into Vercel**:
   - Link your GitHub repository (`groww_sip_discovery_AI_engine`).
   - Keep **Root Directory** as `./` (default).
   - Framework preset will automatically be detected as **Next.js**.

2. **Environment Variables (Optional)**:
   - `GEMINI_API_KEY`: *(Optional)* Your Google Gemini API key for live analysis runs.
   - `DATABASE_URL`: *(Optional)* Your [Turso](https://turso.tech) LibSQL URL (`libsql://<your-db>.turso.io`) for persistent cloud database storage across serverless instances.
   - `DATABASE_AUTH_TOKEN`: *(Optional)* Turso authentication token.
   *(If no database URL is set, the app runs using `/tmp` serverless SQLite).*

3. **Deploy**:
   - Click **Deploy**. Next.js Turbopack build and TypeScript validation will compile cleanly.

---

## 📂 Project Structure

```
groww-sip-lab/
├── src/
│   ├── app/                 # Next.js App Router (Pages, Layout, Server Actions)
│   │   ├── evidence/        # Evidence table, filtering, ingestion modal
│   │   ├── graph/           # D3 causal graph visualization
│   │   ├── opportunities/   # Opportunity prioritization matrix
│   │   ├── reliability/     # AI reliability metrics & evaluation
│   │   ├── themes/          # Thematic analysis breakdown
│   │   └── tracker/         # Fellowship 8-week hypothesis tracker
│   ├── components/          # Reusable UI components & modals
│   ├── db/                  # Drizzle database schema & SQLite client
│   ├── lib/                 # Types, CSV parser, cryptographic hashing
│   └── services/            # Ingestion, AI analysis, evaluations, exports
├── drizzle.config.ts        # Drizzle ORM config
├── vitest.config.ts         # Vitest test runner config
└── package.json
```

---

## 📄 License
This project is developed for the Groww Product Fellowship.
