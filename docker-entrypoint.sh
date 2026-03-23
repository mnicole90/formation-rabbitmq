#!/bin/bash

# Installation automatique des dependances PHP pour chaque session
for dir in /app/session-*/php; do
    if [ -f "$dir/composer.json" ]; then
        echo "[entrypoint] Installation des dependances dans $dir..."
        composer install -d "$dir" --no-interaction --quiet 2>/dev/null
    fi
done

echo "[entrypoint] Dependances installees. Conteneur pret."

# Garder le conteneur en vie
exec tail -f /dev/null
