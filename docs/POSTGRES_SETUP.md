# PostgreSQL Setup Guide

This guide provides instructions for setting up and running the LoRA Manager with a PostgreSQL database, which is recommended for production and robust development environments.

## 1. Using Docker Compose (Recommended)

The easiest way to get started is by using the provided Docker Compose setup. It will automatically launch the backend API, a PostgreSQL database, and a Redis instance for background jobs.

### Prerequisites

-   Docker and Docker Compose installed.

### Steps

1.  **Configure the Database URL:**
    Open the `.env` file (or create one from `.env.example`) and ensure the `DATABASE_URL` is set for PostgreSQL. The default in `docker-compose.yml` is usually correct.

    ```env
    # .env
    DATABASE_URL=postgresql+psycopg://postgres:postgres@postgres:5432/lora
    REDIS_URL=redis://redis:6379/0
    ```

2.  **Start the Services:**
    Run the following command from the project root to start all services in the background.

    ```bash
    docker-compose up -d
    ```
    This will start the `backend`, `postgres`, and `redis` containers.

3.  **Run Database Migrations:**
    Once the containers are running, you need to apply the database schema. Execute the following command to run Alembic migrations inside the running `backend` container.

    ```bash
    docker-compose exec backend alembic upgrade head
    ```

    Your application is now running and connected to the PostgreSQL database.

---

## 2. Manual Setup (Without Docker)

If you prefer to run PostgreSQL and the application directly on your host machine, follow these steps.

### Prerequisites

-   PostgreSQL server installed and running.
-   Python 3.10+ and `pip` installed.
-   A Python virtual environment.

### Steps

1.  **Create a Database and User:**
    Connect to your PostgreSQL server and create a database and user for the application.

    ```sql
    CREATE DATABASE lora;
    CREATE USER lora_user WITH PASSWORD 'your-secure-password';
    GRANT ALL PRIVILEGES ON DATABASE lora TO lora_user;
    ```

2.  **Install Dependencies:**
    In your Python virtual environment, install the required packages, including the PostgreSQL driver.

    ```bash
    pip install -r requirements.txt
    pip install psycopg[binary]
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file and set the `DATABASE_URL` to point to your local PostgreSQL instance.

    ```env
    # .env
    DATABASE_URL=postgresql+psycopg://lora_user:your-secure-password@localhost:5432/lora
    ```

4.  **Run Database Migrations:**
    With the `DATABASE_URL` configured, run Alembic to set up the database schema.

    ```bash
    alembic upgrade head
    ```

5.  **Run the Application:**
    You can now start the FastAPI server.

    ```bash
    uvicorn app.main:app --reload
    ```

---

## Troubleshooting

-   **Alembic "module not found" error:** If Alembic can't find your models, make sure you are running the command from the project root directory.
-   **Connection refused:** Ensure that your PostgreSQL server is running and accessible from where you are running the application (either your local machine or the Docker container). Check firewall rules and the `listen_addresses` in your `postgresql.conf`.
-   **Authentication failed:** Double-check the username, password, and database name in your `DATABASE_URL`.

