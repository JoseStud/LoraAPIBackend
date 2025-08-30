"""Delivery service for managing delivery jobs."""

import json
from typing import Dict, List, Optional

from sqlmodel import Session, select

from app.models import DeliveryJob


class DeliveryService:
    """Service for delivery job operations."""

    def __init__(self, db_session: Session):
        """Initialize DeliveryService with a DB session.
        
        Args:
            db_session: Database session

        """
        self.db_session = db_session

    def create_job(self, prompt: str, mode: str, params: Optional[Dict] = None) -> DeliveryJob:
        """Create and persist a DeliveryJob record.
        
        Args:
            prompt: The prompt to deliver
            mode: Delivery mode (http, cli, sdnext, etc.)
            params: Mode-specific parameters
            
        Returns:
            Created DeliveryJob instance

        """
        dj = DeliveryJob(
            prompt=prompt, 
            mode=mode, 
            params=json.dumps(params or {}),
        )
        self.db_session.add(dj)
        self.db_session.commit()
        self.db_session.refresh(dj)
        return dj

    def get_job(self, job_id: str) -> Optional[DeliveryJob]:
        """Get a delivery job by ID.
        
        Args:
            job_id: Job ID
            
        Returns:
            DeliveryJob instance or None if not found

        """
        return self.db_session.get(DeliveryJob, job_id)

    def list_jobs(self, status: Optional[str] = None, limit: int = 100, offset: int = 0) -> List[DeliveryJob]:
        """List delivery jobs with optional filtering and pagination.
        
        Args:
            status: Optional status filter (pending, running, succeeded, failed)
            limit: Maximum number of jobs to return
            offset: Number of jobs to skip
            
        Returns:
            List of DeliveryJob instances

        """
        q = select(DeliveryJob)
        if status:
            q = q.where(DeliveryJob.status == status)
        
        q = q.offset(offset).limit(limit).order_by(DeliveryJob.created_at.desc())
        return list(self.db_session.exec(q).all())

    def update_job_status(
        self, 
        job_id: str, 
        status: str, 
        result: Optional[Dict] = None,
        error: Optional[str] = None,
    ) -> Optional[DeliveryJob]:
        """Update a delivery job's status and result.
        
        Args:
            job_id: Job ID
            status: New status (pending, running, succeeded, failed)
            result: Optional result data
            error: Optional error message
            
        Returns:
            Updated DeliveryJob instance or None if not found

        """
        job = self.get_job(job_id)
        if job is None:
            return None
        
        job.status = status
        if result is not None:
            job.result = json.dumps(result)
        
        # Set timestamps based on status
        if status == "running" and job.started_at is None:
            from datetime import datetime, timezone
            job.started_at = datetime.now(timezone.utc)
        elif status in ("succeeded", "failed") and job.finished_at is None:
            from datetime import datetime, timezone
            job.finished_at = datetime.now(timezone.utc)
        
        self.db_session.add(job)
        self.db_session.commit()
        self.db_session.refresh(job)
        return job

    def get_job_params(self, job: DeliveryJob) -> Dict:
        """Parse and return job parameters as dict.
        
        Args:
            job: DeliveryJob instance
            
        Returns:
            Parsed parameters dict

        """
        try:
            return json.loads(job.params) if job.params else {}
        except json.JSONDecodeError:
            return {}

    def get_job_result(self, job: DeliveryJob) -> Optional[Dict]:
        """Parse and return job result as dict.
        
        Args:
            job: DeliveryJob instance
            
        Returns:
            Parsed result dict or None

        """
        if not job.result:
            return None
        
        try:
            return json.loads(job.result)
        except json.JSONDecodeError:
            return None
