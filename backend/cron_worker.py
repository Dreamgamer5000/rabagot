import asyncio
import logging
import sys
import os

# Add the current directory to sys.path so we can import 'app'
sys.path.append(os.getcwd())

from app.services.cron_jobs import start_cron_jobs
from app.services.db import connect_to_db, close_db_connection
from app.services.recovery import run_recovery_tasks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)

async def main():
    logging.info("Starting Cron Worker...")
    
    # Connect to DB for recovery and potential cron tasks
    await connect_to_db()
    
    try:
        # Run recovery tasks once
        await run_recovery_tasks()
        
        # Start the cron jobs
        await start_cron_jobs()
        
        # Keep the process alive
        while True:
            await asyncio.sleep(14400)
    except asyncio.CancelledError:
        logging.info("Cron Worker stopping...")
    finally:
        await close_db_connection()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
