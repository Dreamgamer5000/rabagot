import asyncio
import requests
import logging

logger = logging.getLogger(__name__)

async def update_noip():
    """
    Periodically updates No-IP Dynamic DNS.
    """
    url = "https://noip.at/update/picshare/4b5a97a28e12c64bbfca8605e8dfe152654cda77"
    
    while True:
        try:
            logger.info("Updating No-IP...")
            # Use asyncio.to_thread because requests.get is blocking
            response = await asyncio.to_thread(requests.get, url, timeout=10)
            logger.info(f"No-IP update response: {response.status_code}")
        except Exception as e:
            logger.error(f"Error updating No-IP: {e}")
        
        # Wait for 30 minutes before next update (1800 seconds)
        await asyncio.sleep(14400)

async def start_cron_jobs():
    """
    Starts all background cron jobs.
    """
    logger.info("Starting background cron jobs...")
    asyncio.create_task(update_noip())
