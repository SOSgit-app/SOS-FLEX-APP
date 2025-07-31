# FLEX Scheduler App

A Flask application for scheduling FLEX activities.

## Prerequisites

- Python 3.8 or higher
- Google Cloud SDK
- Docker Desktop for Windows
- PowerShell or Command Prompt

## Local Development

1. Clone the repository:
```powershell
git clone https://github.com/yourusername/flex-scheduler-app.git
cd flex-scheduler-app
```

2. Create and activate a virtual environment:

For PowerShell:
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

For Command Prompt:
```cmd
python -m venv venv
.\venv\Scripts\activate.bat
```

3. Install dependencies:
```powershell
pip install -r requirements.txt
```

4. Run the app locally:
```powershell
python app.py
```

The app will be available at `http://localhost:5000`

## Deployment to Google Cloud Run

1. Install the Google Cloud SDK for Windows from:
   https://cloud.google.com/sdk/docs/install

2. Open PowerShell as Administrator and initialize Google Cloud:
```powershell
gcloud init
```

3. Enable required APIs:
```powershell
gcloud services enable cloudbuild.googleapis.com run.googleapis.com
```

4. Set your project ID:
```powershell
gcloud config set project flex-scheduler-app
```

5. Build and deploy to Cloud Run:
```powershell
gcloud builds submit --tag gcr.io/flex-scheduler-app/flex-scheduler
gcloud run deploy flex-scheduler --image gcr.io/flex-scheduler-app/flex-scheduler --platform managed --allow-unauthenticated --region us-central1
```

6. The deployment will provide you with a URL where your app is accessible.

## Project Structure

```
flex-scheduler-app/
├── app.py              # Main Flask application
├── requirements.txt    # Python dependencies
├── Dockerfile         # Container configuration
├── static/            # Static files (CSS, JS, etc.)
└── templates/         # HTML templates
```

## Development vs Production

For development:
- Use `python app.py` to run the development server
- Changes are reflected immediately
- Debug mode is enabled

For production:
- The app runs in a Docker container on Cloud Run
- Uses Gunicorn as the WSGI server
- Optimized for production use

## Troubleshooting

If you get a PowerShell execution policy error when activating the virtual environment, run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

If you get Docker permission errors, make sure Docker Desktop is running and you're in the docker-users group. 