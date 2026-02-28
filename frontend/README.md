# ArchitectAI – AI Architecture Assessment Dashboard

ArchitectAI is a full-stack AI-powered architecture evaluation tool that analyzes system design quality and generates:

• Overall architecture score  
• Risk classification  
• Maturity level  
• Pillar breakdown (Reliability, Scalability, Observability, Cost Optimization)  
• Risk insights & actionable recommendations  
• Historical tracking & analytics trends  

---

## Tech Stack

Frontend:
- React (Vite)
- Recharts
- Modern UI with dynamic analytics

Backend:
- FastAPI
- SQLAlchemy
- PostgreSQL
- Docker

---

## Features

- Run architecture analysis
- Store historical runs
- Visualize score trends
- Export results as JSON
- Clean interactive dashboard

---

## How to Run

### 1. Start database (Docker)
docker compose up -d

### 2. Run backend
cd backend
.\venv\Scripts\activate
python -m uvicorn main:app --reload --port 8000

### 3. Run frontend
cd frontend
npm install
npm run dev

---

Built by Shmook Mohammed Baalhareth