#!/bin/bash
# Builds Docker images locally and loads them into the Kind cluster.
# Kind runs its own Docker daemon and cannot pull from your local image cache
# directly — images must be explicitly loaded with `kind load docker-image`.
set -e

echo "Building server image..."
docker build -t inquiro-server:latest ./server

echo "Building client image..."
docker build -t inquiro-client:latest ./client

echo "Loading images into Kind cluster..."
kind load docker-image inquiro-server:latest --name inquiro-cluster
kind load docker-image inquiro-client:latest --name inquiro-cluster

echo "Done. Images are ready in the cluster."
