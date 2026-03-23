FROM php:8.3-cli

# Installer les dépendances système nécessaires
RUN apt-get update && apt-get install -y \
    unzip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Installer l'extension sockets (nécessaire pour php-amqplib)
RUN docker-php-ext-install sockets

# Installer Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Script d'entrypoint qui installe les vendor automatiquement
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
