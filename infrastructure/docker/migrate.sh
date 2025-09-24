#!/bin/bash
set -e

echo "Running database migrations only..."

# Wait for database to be ready (PostgreSQL)
if [ "$DATABASE_URL" ]; then
    echo "Waiting for database connection..."
    python -c "
import os
import time
import sys
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError

max_tries = 30
tries = 0
db_url = os.getenv('DATABASE_URL', 'sqlite:///db.sqlite')

while tries < max_tries:
    try:
        engine = create_engine(db_url)
        connection = engine.connect()
        connection.close()
        print('Database connection successful!')
        break
    except OperationalError as e:
        tries += 1
        print(f'Database connection attempt {tries}/{max_tries} failed: {e}')
        if tries < max_tries:
            time.sleep(2)
        else:
            print('Could not connect to database after maximum attempts')
            sys.exit(1)
"
fi

# Run database migrations
echo "Running database migrations..."
cd /app/infrastructure
alembic upgrade head

if [ $? -eq 0 ]; then
    echo "Database migrations completed successfully!"
else
    echo "Database migrations failed!"
    exit 1
fi