# Use an official Python runtime as the base image
FROM python:3.9-slim

# Install MongoDB (from Debian repositories) and any other required packages
RUN apt-get update && \
    apt-get install -y mongodb && \
    rm -rf /var/lib/apt/lists/*

# Create the MongoDB data directory
RUN mkdir -p /data/db

# Set the working directory
WORKDIR /app

# Copy the requirements file and install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the rest of the application code
COPY . .

# Ensure the entrypoint script is executable
RUN chmod +x /app/entrypoint.sh

# Expose the FastAPI port
EXPOSE 8000

# Set the entrypoint to our custom script
ENTRYPOINT ["/app/entrypoint.sh"]

# The container’s default command: start FastAPI with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
