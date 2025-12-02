import json
import time
import os

from app.services.resy_client import ResyClient
from app.core.config import settings


# ---------- Client Storage ----------

class ClientManager:
    def __init__(self):
        self.resy_client_storage = {}
        self.storage_file = "tasks.json"
        self.max_age = 200 # 200 seconds

    def _load_tasks(self):
        """Load tasks from JSON file, return empty dict if file doesn't exist."""
        if not os.path.exists(self.storage_file):
            return {}
        try:
            with open(self.storage_file, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return {}

    def _save_tasks(self, tasks):
        """Save tasks to JSON file."""
        with open(self.storage_file, "w") as f:
            json.dump(tasks, f)

    def get_resy_client(self, task_id: str):
        tasks = self._load_tasks()
        task = tasks.get(task_id, None)

        if not task:
            # New task - create client
            resy_client = ResyClient(
                api_key=settings.RESY_API_KEY,
                user_agent=settings.USER_AGENT,
                request_timeout=settings.REQUEST_TIMEOUT
            )
            self.resy_client_storage[task_id] = resy_client
        else:
            # Existing task - get from memory or create if missing
            resy_client = self.resy_client_storage.get(task_id, None)

            # If the client is for some reason in json but not in memory, create a new one
            if not resy_client:
                resy_client = ResyClient(
                    api_key=settings.RESY_API_KEY,
                    user_agent=settings.USER_AGENT,
                    request_timeout=settings.REQUEST_TIMEOUT
                )
                self.resy_client_storage[task_id] = resy_client

        # Update last accessed time
        tasks[task_id] = {"lastUpdated": time.time()}
        self._save_tasks(tasks)

        return resy_client

    def clean_up_old_clients(self):
        tasks = self._load_tasks()
        current_time = time.time()
        tasks_to_remove = []

        # Find tasks to remove (can't modify dict while iterating)
        for task_id, task in tasks.items():
            if current_time - task["lastUpdated"] > self.max_age:
                tasks_to_remove.append(task_id)

        # Remove from both storage and tasks dict
        for task_id in tasks_to_remove:
            self.resy_client_storage.pop(task_id, None)
            tasks.pop(task_id, None)

        # Save updated tasks
        self._save_tasks(tasks)

