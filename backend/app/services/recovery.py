from app.services.db import db
from collections import defaultdict
import logging

async def run_recovery_tasks():
    """
    Handles interrupted syncs and pending photos from previous runs.
    Should be run once on startup.
    """
    logging.info("🔄 Checking for interrupted syncs...")
    
    # Reset any events stuck in "syncing" status
    syncing_events = await db.fetch_all(
        "SELECT id, name FROM events WHERE sync_status = 'syncing'"
    )
    
    if syncing_events:
        logging.warning(f"⚠️  Found {len(syncing_events)} events stuck in 'syncing' status")
        for event in syncing_events:
            await db.execute(
                "UPDATE events SET sync_status = 'idle' WHERE id = ?",
                (event["id"],)
            )
            logging.info(f"   ✓ Reset event: {event['name']}")
    
    # Check for pending photos that need processing
    pending_photos = await db.fetch_all(
        """
        SELECT p.id, p.event_id, p.original_file_name, e.slug 
        FROM photos p
        JOIN events e ON p.event_id = e.id
        WHERE p.status = 'pending'
        """
    )
    
    if pending_photos:
        logging.warning(f"⚠️  Found {len(pending_photos)} pending photos from interrupted processing")
        logging.info(f"   These will be processed when you trigger sync again for their events")
        
        # Group by event for reporting
        events_with_pending = defaultdict(int)
        for photo in pending_photos:
            events_with_pending[photo["event_id"]] += 1
        
        for event_id, count in events_with_pending.items():
            logging.info(f"   • Event ID {event_id[:8]}...: {count} pending photos")
    
    logging.info("✅ Recovery check complete\n")
