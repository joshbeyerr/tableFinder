import logging
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('api_requests.log')
    ]
)

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        """
        Log all incoming requests with method, path, query params, and response details.
        """
        start_time = time.time()
        
        # Extract request info
        method = request.method
        path = request.url.path
        query_params = dict(request.query_params) if request.query_params else {}
        
        # Log incoming request
        logger.info(
            f"→ Incoming {method} {path}",
            extra={
                "method": method,
                "path": path,
                "query_params": query_params,
            }
        )
        
        try:
            # Process the request
            response = await call_next(request)
        except Exception as e:
            elapsed_time = time.time() - start_time
            logger.error(
                f"✗ {method} {path} failed with error: {str(e)} ({elapsed_time:.3f}s)"
            )
            raise
        
        # Calculate response time
        elapsed_time = time.time() - start_time
        status_code = response.status_code
        
        # Color-code based on status
        if 200 <= status_code < 300:
            icon = "✓"
        elif 300 <= status_code < 400:
            icon = "→"
        elif 400 <= status_code < 500:
            icon = "⚠"
        else:
            icon = "✗"
        
        # Log response
        logger.info(
            f"{icon} {method} {path} - {status_code} ({elapsed_time:.3f}s)"
        )
        
        return response
