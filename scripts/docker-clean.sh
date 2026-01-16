#!/bin/bash

echo "⚠️  WARNING: This will stop ALL containers and delete ALL volumes (Redis, MinIO data)."
read -p "Are you sure? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    exit 1
fi

docker compose --profile infra --profile gate --profile db down -v
docker system prune -f

echo "✨ Clean slate achieved."
