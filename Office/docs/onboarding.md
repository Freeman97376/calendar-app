# Onboarding - Run the Calendar App from Scratch

> Target: working local frontend + backend environment on Windows PowerShell.

---

## Prerequisites

- Node.js 20+ and npm 10+.
- Python 3.11+ for the local fridge backend.
- Tesseract OCR installed for receipt OCR.
- Optional: frontend AI API key for scheduling AI, or use the built-in local planner.
- Optional: DeepSeek API key for fridge receipt fallback analysis.
- Optional: Firebase project for Firestore sync.

---

## Step 1 - Open the Project

```powershell
cd "C:\Users\Zheng\Desktop\calendar app"
```

---

## Step 2 - Install Dependencies

Frontend:

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
```

Backend Python venv:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

If PowerShell blocks venv activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

The current backend uses Python standard-library modules. OCR depends on the installed Tesseract program, not a pip package.

---

## Step 3 - Configure Environment

```powershell
Copy-Item .env.example .env.local -ErrorAction SilentlyContinue
```

Open `.env.local` and fill only what you use:

```env
# Frontend AI
VITE_AI_PROVIDER=api
VITE_AI_API_KEY=
VITE_AI_API_BASE_URL=https://api.deepseek.com
VITE_AI_API_MODEL=deepseek-chat

# Fridge frontend/backend bridge
VITE_FRIDGE_API_BASE_URL=http://127.0.0.1:8787

# Backend DeepSeek, no VITE_ prefix
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
FRIDGE_DATA_DIR=
```

Firebase values are optional unless you want Firestore sync:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

---

## Step 4 - Verify Tesseract

The backend detects OCR with `shutil.which("tesseract")`, so `tesseract.exe` must be on PATH in the same PowerShell session that starts the backend.

```powershell
tesseract --version
```

If Tesseract is installed at the default Windows path but not detected:

```powershell
$env:Path = "C:\Program Files\Tesseract-OCR;$env:Path"
tesseract --version
```

Permanent user PATH:

```powershell
[Environment]::SetEnvironmentVariable(
  "Path",
  [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\Program Files\Tesseract-OCR",
  "User"
)
```

Close and reopen PowerShell after a permanent PATH update.

---

## Step 5 - Run the App

Terminal 1, frontend:

```powershell
cd "C:\Users\Zheng\Desktop\calendar app"
& "C:\Program Files\nodejs\npm.cmd" run dev
```

Terminal 2, backend:

```powershell
cd "C:\Users\Zheng\Desktop\calendar app"
.\.venv\Scripts\Activate.ps1
tesseract --version
python -m backend.server
```

Open:

```text
http://localhost:5173/
```

---

## Step 6 - Configure In-App Settings

Open `Tools -> Settings`.

Confirm:

- `Fridge API base URL` is `http://127.0.0.1:8787`.
- AI API settings are filled if using API-backed scheduling AI, or `local` is selected in Settings.
- DeepSeek key/base URL/model are filled if using fridge fallback analysis.
- Event/task defaults match your preferred local workflow.

---

## Step 7 - Test the Receipt Flow

Open `Tools -> Fridge`, upload a clear receipt image, and run analysis.

Backend-only receipt test:

```powershell
curl.exe -X POST "http://127.0.0.1:8787/api/fridge/receipt/analyze" `
  -F "image=@C:\path\to\receipt.png" `
  -F "timezone=America/Los_Angeles"
```

---

## Step 8 - Run Automated Tests

```powershell
& "C:\Program Files\nodejs\npm.cmd" run test:run
$env:PYTHONPATH="C:\Users\Zheng\Desktop\calendar app"; python -m unittest discover tests\backend
```

---

## Step 9 - Build for Production

```powershell
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" run preview
```

---

## Project Structure

```text
Office/          <- project management, planning, docs, testing notes
src/             <- React/Vite frontend
backend/         <- local Python fridge backend
tests/           <- automated tests
scratch/         <- temporary files and one-off/manual test scripts
```

Full architecture: [planning/architecture.md](../planning/architecture.md)

---

## Common Commands

| Command | What it does |
|---------|-------------|
| `& "C:\Program Files\nodejs\npm.cmd" run dev` | Start Vite dev server |
| `python -m backend.server` | Start local backend on `127.0.0.1:8787` |
| `tesseract --version` | Confirm OCR executable is visible on PATH |
| `& "C:\Program Files\nodejs\npm.cmd" run test:run` | Run frontend tests once |
| `$env:PYTHONPATH="C:\Users\Zheng\Desktop\calendar app"; python -m unittest discover tests\backend` | Run backend tests |
| `& "C:\Program Files\nodejs\npm.cmd" run lint` | Run ESLint |
| `& "C:\Program Files\nodejs\npm.cmd" run build` | Production build |

---

## Getting Unstuck

- Errors: [tracking/errors.md](../tracking/errors.md)
- Current tasks: [tasks/active-sprint.md](../tasks/active-sprint.md)
- Architecture decisions: [planning/decisions/](../planning/decisions/)
