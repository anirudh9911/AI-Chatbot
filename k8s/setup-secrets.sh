#!/bin/bash
# Reads API keys from server/.env and creates the K8s secret in the inquiro namespace.
# Safe to run multiple times — uses --dry-run=client | kubectl apply to be idempotent.
set -e

# Load env vars from server/.env
source server/.env

kubectl create secret generic inquiro-secrets \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY" \
  --from-literal=TAVILY_API_KEY="$TAVILY_API_KEY" \
  -n inquiro \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secret applied successfully."
