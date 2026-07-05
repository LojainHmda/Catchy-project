@echo off
cd /d "%~dp0"

echo Deploying to Cloud Run...
echo.

gcloud run deploy catchy-web ^
  --source . ^
  --region us-central1 ^
  --allow-unauthenticated ^
  --cpu 2 ^
  --memory 4Gi

echo.
echo Done! Visit: https://catchy-web-423659149456.us-central1.run.app/
pause
