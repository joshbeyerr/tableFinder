import random
import time
from typing import Optional, Dict, Any
import requests
from urllib.parse import urlencode
import json
import re

class ResyClientError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None, details: Optional[dict] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class ResyClient:
    def __init__(
        self,
        api_key: str,
        user_agent: str,
        request_timeout: float = 12.0,
        max_retries: int = 3,
        backoff_base: float = 0.7,
    ):
        self.api_key = api_key
        self.user_agent = user_agent
        self.timeout = request_timeout
        self.max_retries = max_retries
        self.backoff_base = backoff_base

        self.userAuth = ""

        self.session = requests.Session()

        headers = {
            'user-agent': '' + self.user_agent,
            'Accept-Encoding': 'gzip, deflate, br, zstd', 
            'accept': 'application/json, text/plain, */*', 
            'authorization': 'ResyAPI api_key="{}"'.format(self.api_key), 
            'authority': 'api.resy.com'
        }   
        self.session.headers.update(headers)

  

    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        """HTTP request with retry/backoff (no proxies)."""
        kwargs.setdefault("timeout", self.timeout)

        last_exc = None
        for attempt in range(1, self.max_retries + 1):
            try:

                resp = self.session.request(method, url, **kwargs)

                
                # Retry certain upstream statuses; otherwise raise with details.
                if resp.status_code >= 400:
                    if resp.status_code in (429, 500, 502, 503, 504) and attempt < self.max_retries:
                        sleep_s = self.backoff_base * (2 ** (attempt - 1)) + random.random() * 0.3
                        time.sleep(sleep_s)
                        continue
                    raise ResyClientError(
                        f"Upstream error {resp.status_code}",
                        status_code=resp.status_code,
                        details={"text": resp.text}
                    )

                return resp
            except (requests.Timeout, requests.ConnectionError) as e:
                last_exc = e
                if attempt < self.max_retries:
                    sleep_s = self.backoff_base * (2 ** (attempt - 1)) + random.random() * 0.3
                    time.sleep(sleep_s)
                    continue
                raise ResyClientError("Network error", details={"error": str(e)})
        raise ResyClientError("Network error", details={"error": str(last_exc)})

    # --- Public methods ---

    def lookup_venue(self, url: str) -> Dict[str, Any]:
        """
        GET /3/venue?url_slug=<venue_slug>&location=<city_slug>
        Returns JSON that includes `id`.
        """

        RESY_URL_RE = re.compile(
            r"^https?://(www\.)?resy\.com/cities/([^/]+)/venues/([^/?#]+)",
            re.IGNORECASE
            )
        
        def parse_resy_url(url: str):
            """
            Extract (city_slug, venue_slug) from a Resy venue URL like:
            https://resy.com/cities/toronto-on/venues/casa-paco
            """
            m = RESY_URL_RE.match(url.strip())
            if not m:
                from urllib.parse import urlparse
                path = urlparse(url).path.strip("/")
                parts = path.split("/")
                if len(parts) >= 4 and parts[0] == "cities" and parts[2] == "venues":
                    return parts[1], parts[3]
                raise ValueError("URL does not look like a valid Resy venue URL")
            return m.group(2), m.group(3)


        city_slug, venue_slug = parse_resy_url(url.strip())

        url = "https://api.resy.com/3/venue"

        params = {"url_slug": venue_slug, "location": city_slug}

        resp = self._request("GET", url, params=params)

        data = resp.json()
        if "id" not in data:
            raise ResyClientError("Venue lookup did not return an id", details={"response": data})
        
        return data

    def get_calendar(self, venue_id: str, num_seats: int, start_date: str, end_date: str) -> Dict[str, Any]:
        """
        GET /4/venue/calendar?venue_id=...&num_seats=...&start_date=...&end_date=...
        Pass-through JSON.
        """
        url = "https://api.resy.com/4/venue/calendar"
        params = {
            "venue_id": venue_id,
            "num_seats": num_seats,
            "start_date": start_date,
            "end_date": end_date
        }
        resp = self._request("GET", url, params=params)
        return resp.json()
    
    def find(self, venue_id: str, num_seats: int, day: str, time_filter: Optional[str] = None) -> Dict[str, Any]:
        """
        POST /4/find
        Body JSON:
        {
            "day": "2025-09-02",
            "lat": 0,
            "long": 0,
            "party_size": 2,
            "venue_id": "12345",
            "time_filter": "evening"    # optional
        }
        Returns the Resy /4/find JSON response.
        """
        url = "https://api.resy.com/4/find"
        payload = {
            "day": day,
            "lat": 0,
            "long": 0,
            "party_size": num_seats,
            "venue_id": venue_id,
        }

        if time_filter:
            payload["time_filter"] = time_filter

        resp = self._request("POST", url, json=payload).json()
        
        return resp
    
    def login(self, email: str, password: str) -> None:

        url = "https://api.resy.com/4/auth/password"
        payload = {
            "email": email,
            "password": password,
        }

        print(payload)

        resp = self._request("POST", url, data=payload)
        if resp.status_code != 200:
            raise ResyClientError("Login failed", status_code=resp.status_code, details={"text": resp.text})
        data = resp.json()

        self.userAuth = data.get("token", "")

        if not self.userAuth:
            raise ResyClientError("Login did not return an auth token", details={"response": data})

    
    def setToken(self, token: Optional[str] = None) -> None:
        """
        Set the authorization token for the client.
        If token is provided, use it directly. Otherwise, use self.userAuth.
        """
        auth_token = token if token is not None else self.userAuth
        
        if not auth_token:
            raise ResyClientError("Authorization token not set. Please login first to obtain a token or provide a token.")

        # Store the token in userAuth for consistency
        if token is not None:
            self.userAuth = token

        self.session.headers.update({
            "x-resy-auth-token": "" + auth_token,
            "x-resy-universal-auth": "" + auth_token,
        })

    def setCookie(self, dic: dict) -> None:
        """
        Set the authorization token for the client.
        """

        for key, value in dic.items():
            self.session.cookies.set(key, value)
   

    def getReservation(self, config_id, day, party_size):


        if not self.userAuth:
            raise ResyClientError("Authorization token not set. Please set the token using setToken().")
        
        data = {
            "commit": 0,
            "config_id": config_id,
            "day": day,
            "party_size": party_size
        }
        print("sending get reso")
        url = "https://api.resy.com/3/details"

        resp = self._request("POST", url, json=data)
        
        time.sleep(0.5)
        data["commit"] = 1
        print("sending commit reso")
        resp = self._request("POST", url, json=data).json()
    
        return resp

    def book(self, book_token: str, payment_method_id):

        self.session.headers.update({
            "Content-Type": "application/x-www-form-urlencoded",

        })

        data: Dict[str, Any] = {
            "book_token": book_token,
            "source_id": "resy.com-venue-details",
            "venue_marketing_opt_in": "0"
        }
        if payment_method_id is not None:
            data["struct_payment_method"] = json.dumps({"id": int(payment_method_id)})


        url = "https://api.resy.com/3/book"
        resp = self._request("POST", url, data=data)

        return resp.json()

    
    def getUser(self):
        
        """
        GET /2/users
        Returns the user's information.
        """
        if not self.userAuth:
            raise ResyClientError("Authorization token not set. Please set the token using setToken().")

        url = "https://api.resy.com/2/user"
        resp = self._request("GET", url)
        return resp.json()

    def venue_search(
        self,
        latitude: float,
        longitude: float,
        query: str,
        day: Optional[str] = None,
        party_size: Optional[int] = None,
        per_page: int = 5
    ) -> Dict[str, Any]:
        """
        POST /3/venuesearch/search
        Search for venues by location and query.
        
        Args:
            latitude: Latitude coordinate
            longitude: Longitude coordinate
            query: Search query string
            day: Optional date filter (YYYY-MM-DD format)
            party_size: Optional party size for slot filtering
            per_page: Number of results per page (default 5)
        
        Returns the search response JSON.
        """
        url = "https://api.resy.com/3/venuesearch/search"
        
        payload = {"geo":{"latitude":latitude,"longitude":longitude},"highlight":{"pre_tag":"<b>","post_tag":"</b>"},"per_page":5,"query":query,"slot_filter":{"day":"2025-12-14","party_size":2},"types":["venue","cuisine"]}
        # Add slot filter if day is provided
        # if day:
        #     slot_filter: Dict[str, Any] = {
        #         "day": day
        #     }
        #     if party_size:
        #         slot_filter["party_size"] = party_size
        #     payload["slot_filter"] = slot_filter
        
        resp = self._request("POST", url, json=payload)
        return resp.json()