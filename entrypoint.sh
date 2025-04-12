#!/bin/bash
set -e

echo "Generating .env file from environment variables..."

# Generate .env file using env vars, defaulting if not provided
cat <<EOF > .env
SECRET_KEY=${SECRET_KEY:-THANK_YOU_FOR_USING_THIS_IMAGE}
ALGORITHM=${ALGORITHM:-HS256}
MODEL=${MODEL:-nuriyev/Qwen2.5-0.5B-Instruct-medical-dpo}
MONGO_URI=${MONGO_URI:-mongodb://localhost:27017}
EOF

echo ".env file created:"
cat .env

echo "Starting MongoDB..."
# Start the MongoDB server in the background
mongod --dbpath /data/db --bind_ip_all &

# Optional: Wait a few seconds for MongoDB to initialize
sleep 5

echo "Starting FastAPI App..."
# Execute the command passed as CMD, which starts Uvicorn
exec "$@"
