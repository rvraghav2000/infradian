FROM python:3.11-slim

WORKDIR /app

# Install dependencies first to leverage Docker cache
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source code
COPY . .

# Expose the API port
EXPOSE 8000

# Set the entrypoint to run the FastAPI application
ENV PYTHONPATH=/app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
