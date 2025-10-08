@echo off
REM Local verification script for Windows (cmd.exe)
REM Run these steps from the repo root in cmd.exe or PowerShell (cmd compatibility)

echo Installing dependencies...
npm install

if %errorlevel% neq 0 (
  echo npm install failed
  exit /b %errorlevel%
)

echo Running TypeScript check...
npx tsc --noEmit
if %errorlevel% neq 0 (
  echo TypeScript errors found
  exit /b %errorlevel%
)

echo Running integration tests (single-threaded)...
npm run test:integration
if %errorlevel% neq 0 (
  echo Tests failed
  exit /b %errorlevel%
)

echo Launching development server (Vite) in background...
start cmd /k "npm run dev"

echo After Vite starts, run Electron dev in a new terminal:

echo npm run electron:dev

echo When finished, stop background terminals.
exit /b 0
