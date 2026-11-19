"""
Asynchronous HTTP Client for Node.js Backend Integration.
Provides resilient, authenticated communication with the main Express backend.
"""
from typing import Any, Dict, Optional
import httpx

from app.core.config import get_settings
from app.core.exceptions import ExternalServiceError
from app.core.logging import get_logger

logger = get_logger("integrations.node_client")


class NodeBackendClient:
    """Asynchronous HTTP client for interacting with the Node.js backend."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        service_secret: Optional[str] = None,
        timeout: Optional[float] = None,
        client: Optional[httpx.AsyncClient] = None,
    ):
        settings = get_settings()
        self.base_url = (base_url or settings.NODE_BACKEND_URL).rstrip("/")
        self.service_secret = service_secret or settings.AI_SERVICE_SECRET
        self.timeout = timeout or settings.NODE_BACKEND_TIMEOUT
        self._client = client

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.timeout),
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "BhartiyeCrafts-AI-Service/1.0",
                },
            )
        return self._client

    async def close(self) -> None:
        """Close the underlying HTTP client session."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _build_headers(
        self,
        seller_id: Optional[str] = None,
        store_id: Optional[str] = None,
        user_role: Optional[str] = None,
        custom_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, str]:
        """Construct authenticated request headers with internal secret and tenant context."""
        headers: Dict[str, str] = {
            "X-Internal-Service-Key": self.service_secret,
        }
        if seller_id:
            headers["X-Seller-ID"] = str(seller_id)
        if store_id:
            headers["X-Store-ID"] = str(store_id)
        if user_role:
            headers["X-User-Role"] = str(user_role)
        if custom_headers:
            headers.update(custom_headers)
        return headers

    async def request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        seller_id: Optional[str] = None,
        store_id: Optional[str] = None,
        user_role: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Execute an authenticated request against the Node.js backend.
        Handles connection failures, timeouts, and non-2xx responses gracefully.
        """
        client = await self._get_client()
        url = endpoint if endpoint.startswith("/") else f"/{endpoint}"
        req_headers = self._build_headers(
            seller_id=seller_id,
            store_id=store_id,
            user_role=user_role,
            custom_headers=headers,
        )

        try:
            response = await client.request(
                method=method.upper(),
                url=url,
                params=params,
                json=json_data,
                headers=req_headers,
            )
        except httpx.TimeoutException as exc:
            msg = f"Request to Node.js backend '{method} {url}' timed out after {self.timeout}s."
            logger.error(msg)
            raise ExternalServiceError(message=msg, details={"endpoint": url, "timeout": self.timeout}) from exc
        except httpx.ConnectError as exc:
            msg = f"Cannot connect to Node.js backend at '{self.base_url}'."
            logger.error(msg)
            raise ExternalServiceError(message=msg, details={"base_url": self.base_url, "endpoint": url}) from exc
        except httpx.RequestError as exc:
            msg = f"Network failure communicating with Node.js backend: {str(exc)}"
            logger.error(msg)
            raise ExternalServiceError(message=msg, details={"endpoint": url}) from exc

        # Handle HTTP status codes
        if response.status_code >= 400:
            error_details = None
            error_msg = f"Node.js backend returned status {response.status_code}"
            try:
                error_json = response.json()
                error_msg = error_json.get("message", error_msg)
                error_details = error_json
            except Exception:
                error_details = {"raw_text": response.text[:200]}

            logger.warning(f"Node.js error response: {response.status_code} - {error_msg}")
            raise ExternalServiceError(
                message=error_msg,
                details={"status_code": response.status_code, "backend_response": error_details},
            )

        # Parse success JSON
        try:
            return response.json()
        except Exception as exc:
            msg = f"Node.js backend returned malformed non-JSON response from '{url}'."
            logger.error(msg)
            raise ExternalServiceError(message=msg, details={"endpoint": url}) from exc

    async def get(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        seller_id: Optional[str] = None,
        store_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """HTTP GET helper."""
        return await self.request("GET", endpoint, params=params, seller_id=seller_id, store_id=store_id)

    async def post(
        self,
        endpoint: str,
        json_data: Optional[Dict[str, Any]] = None,
        seller_id: Optional[str] = None,
        store_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """HTTP POST helper."""
        return await self.request("POST", endpoint, json_data=json_data, seller_id=seller_id, store_id=store_id)


# Client singleton provider
_default_node_client: Optional[NodeBackendClient] = None


def get_node_client() -> NodeBackendClient:
    """Return reusable NodeBackendClient instance."""
    global _default_node_client
    if _default_node_client is None:
        _default_node_client = NodeBackendClient()
    return _default_node_client
