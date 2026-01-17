#!/bin/bash
set -e

echo "🚀 Quick Start Interdomestik System"
echo "==================================="

# Start everything in one go
echo "Starting all services..."
docker-compose --profile infra --profile gate up -d --build

echo "✅ System starting up!"
echo ""
echo "Services will be available at:"
echo "   - Web App:     http://localhost:3000"
echo "   - Mailpit:     http://localhost:8025"
echo "   - MinIO:       http://localhost:9001"
echo "   - Supabase:    http://localhost:54323"
echo ""
echo "Note: Make sure Supabase is running separately if needed."
echo "To stop: docker-compose down"