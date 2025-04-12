# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the entire project into the container
COPY . .

# Copy and set permissions for the entrypoint script
RUN chmod +x /app/entrypoint.sh

# Expose port 8000 for the app
EXPOSE 8000

# Set the entrypoint to generate .env and then run Uvicorn
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
