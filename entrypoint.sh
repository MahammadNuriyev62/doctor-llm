#!/bin/bash

echo "Generating .env file from environment variables..."

# Create a .env file using provided env vars, falling back to defaults if not present.
cat <<EOF > .env
SECRET_KEY=${SECRET_KEY:-THANK_YOU_FOR_USING_THIS_IMAGE}
ALGORITHM=${ALGORITHM:-HS256}
MODEL=${MODEL:-nuriyev/Qwen2.5-0.5B-Instruct-medical-dpo}
MONGO_URI=${MONGO_URI:-mongodb://localhost:27017}
EOF

echo ".env file created:"
cat .env

# Execute the CMD passed from Dockerfile
exec "$@"
