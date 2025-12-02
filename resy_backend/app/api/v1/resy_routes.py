# app/api/v1/resy_routes.py
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel

from app.core.security import rate_limiter
from app.services.clientManager import ClientManager
from app.services.resy_client import ResyClientError
from app.core.token_manager import generate_session_token, validate_session_token

from app.core.config import settings    

router = APIRouter(prefix="/resy", tags=["resy"])

# Initialize client manager singleton
client_manager = ClientManager()


# ---------- Pydantic models ----------

class SlotOut(BaseModel):
    token: str
    type: str
    start: str
    end: str
    is_paid: bool


class SlotsResponse(BaseModel):
    venue_id: int
    day: str
    num_seats: int
    slots: List[SlotOut]


class SlotSearchQuery(BaseModel):
    venue_id: int
    day: str          # "YYYY-MM-DD"
    num_seats: int
    time_filter: Optional[str] = None  # "evening", "21:30", etc.


class ReservationPreviewRequest(BaseModel):
    config_id: str
    day: str
    party_size: int


class ReservationPreviewResponse(BaseModel):
    book_token: str
    payment_methods: List[Dict[str, Any]]


class BookRequest(BaseModel):
    book_token: str
    payment_method_id: Optional[int] = None


class BookResponse(BaseModel):
    status: str
    raw: Dict[str, Any]

class IdRequest(BaseModel):
    URL: str

class IdResponse(BaseModel):
    venue_id: int
    venue_name: str
    session_token: str

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    status: str
    session_token: str

class MeResponse(BaseModel):
    user: Dict[str, Any]


class calendarRequest(BaseModel):
    venue_id: int
    num_seats: int
    start_date: str          # "YYYY-MM-DD"
    end_date: str          # "YYYY-MM-DD"

class calendarResponse(BaseModel):
    dates: List[str]

# ---------- Routes ----------

@router.post("/slots", response_model=SlotsResponse, dependencies=[Depends(rate_limiter), Depends(validate_session_token)])
def get_slots(
    query: SlotSearchQuery,
    x_task_id: str = Header(..., alias="x-task-id")
):
    """
    Search for available slots at a venue.
    This wraps Resy /4/find.
    Requires a valid session token (obtained from /login or /getID).
    """
    # validate_session_token dependency ensures token is valid and matches task_id
    resy_client = client_manager.get_resy_client(x_task_id)
    try:
        resp = resy_client.find(
            venue_id=str(query.venue_id),
            num_seats=query.num_seats,
            day=query.day,
            time_filter=query.time_filter,
        )
    except ResyClientError as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e.message}")

    venues = resp.get("results", {}).get("venues", [])
    if not venues:
        return SlotsResponse(
            venue_id=query.venue_id,
            day=query.day,
            num_seats=query.num_seats,
            slots=[]
        )

    venue = venues[0]
    slots_out: List[SlotOut] = []

    for s in venue.get("slots", []):
        cfg = s.get("config", {})
        date = s.get("date", {})
        payment = s.get("payment", {})

        slots_out.append(
            SlotOut(
                token=cfg.get("token"),
                type=cfg.get("type"),
                start=date.get("start"),
                end=date.get("end"),
                is_paid=bool(payment.get("is_paid")),
            )
        )

    return SlotsResponse(
        venue_id=query.venue_id,
        day=query.day,
        num_seats=query.num_seats,
        slots=slots_out,
    )


@router.post(
    "/reservation/preview",
    response_model=ReservationPreviewResponse,
    dependencies=[Depends(rate_limiter)],
)
def preview_reservation(
    body: ReservationPreviewRequest,
    x_task_id: str = Header(..., alias="x-task-id")
):
    """
    Hit your getReservation wrapper that does the commit sequence and returns
    the book_token + user payment methods.
    """
    resy_client = client_manager.get_resy_client(x_task_id)
    try:
        res_json = resy_client.getReservation(
            config_id=body.config_id,
            day=body.day,
            party_size=body.party_size,
        )
    except ResyClientError as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e.message}")

    book_token = res_json.get("book_token", {}).get("value")
    user = res_json.get("user") or {}
    payment_methods = user.get("payment_methods") or []

    if not book_token:
        raise HTTPException(status_code=500, detail="No book_token returned")

    return ReservationPreviewResponse(
        book_token=book_token,
        payment_methods=payment_methods,
    )


@router.post(
    "/reservation/book",
    response_model=BookResponse,
    dependencies=[Depends(rate_limiter)],
)
def book_reservation(
    body: BookRequest,
    x_task_id: str = Header(..., alias="x-task-id")
):
    """
    Confirm the booking using the book_token and optional payment_method_id.
    """
    resy_client = client_manager.get_resy_client(x_task_id)

    if settings.MODE != "production":
        # In non-production modes, we don't want to actually book anything.
        print("Skipping booking in non-production mode.")
        return BookResponse(
            status="skipped",
            raw={"message": "Booking skipped in non-production mode."},
        )

    try:
        result = resy_client.book(
            book_token=body.book_token,
            payment_method_id=body.payment_method_id,
        )
    except ResyClientError as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e.message}")

    # You can shape this however you want; here I keep raw for debugging
    return BookResponse(
        status="ok",
        raw=result,
    )



@router.post(
    "/getID",
    response_model=IdResponse,
    dependencies=[Depends(rate_limiter)],
)
def getID(
    body: IdRequest,
    x_task_id: str = Header(..., alias="x-task-id")
):
    """
    Takes in a resy.com restauraunts URL and returns the venue id and venue name.
    Also returns a session token for protected API calls.
    """
    resy_client = client_manager.get_resy_client(x_task_id)
    try:
        print(f"[getID] Looking up venue with URL: {body.URL}")
        res_json = resy_client.lookup_venue(
            url=body.URL,
        )
        print(f"[getID] Lookup successful, response keys: {list(res_json.keys())}")
    except ValueError as e:
        print(f"[getID] ValueError: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid URL format: {str(e)}")
    except ResyClientError as e:
        error_detail = f"Upstream error: {e.message}"
        if e.details:
            error_detail += f" | Details: {e.details}"
        print(f"[getID] ResyClientError: {error_detail}")
        raise HTTPException(status_code=502, detail=error_detail)
    except Exception as e:
        print(f"[getID] Unexpected error: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

    venue_id_obj = res_json.get("id")
    if not venue_id_obj or not isinstance(venue_id_obj, dict):
        raise HTTPException(status_code=500, detail="Invalid venue ID format in response")
    
    venue_id = str(venue_id_obj.get("resy"))
    venue_name = str(res_json.get("name", ""))

    if not venue_id:
        raise HTTPException(status_code=500, detail="No venue ID returned from lookup")

    # Generate and return a session token
    session_token = generate_session_token(x_task_id)
    
    response = IdResponse(
        venue_id=venue_id,
        venue_name=venue_name,
        session_token=session_token
    )
    
    return response

@router.post(
    "/login",
    response_model=LoginResponse,
    dependencies=[Depends(rate_limiter)],
)
def login(
    body: LoginRequest,
    x_task_id: str = Header(..., alias="x-task-id")
):
    """
    Log in to Resy with email + password and store the auth token
    on the task-specific resy_client session.
    Returns a session token for protected API calls.
    """
    resy_client = client_manager.get_resy_client(x_task_id)
    try:
        # Use the ResyClient methods you already have
        resy_client.login(email=body.email, password=body.password)
        resy_client.setToken()
    except ResyClientError as e:
        # Bubble up a clean error to the client
        raise HTTPException(
            status_code=401 if (e.status_code and e.status_code == 401) else 502,
            detail=f"Login failed: {e.message}",
        )

    # Generate and return a session token
    session_token = generate_session_token(x_task_id)
    response = LoginResponse(
        status="ok",
        session_token=session_token
    )
    return response


# ---------- Me route ----------

@router.get(
    "/me",
    response_model=MeResponse,
    dependencies=[Depends(rate_limiter)],
)
def get_me(x_task_id: str = Header(..., alias="x-task-id")):
    """
    Return the current logged-in Resy user.
    Requires that /login has already been called successfully so
    resy_client has an auth token set.
    """
    resy_client = client_manager.get_resy_client(x_task_id)
    try:
        user_json = resy_client.getUser()
    except ResyClientError as e:
        raise HTTPException(
            status_code=401 if (e.status_code and e.status_code == 401) else 502,
            detail=f"Failed to fetch user: {e.message}",
        )

    return MeResponse(user=user_json)



@router.post(
    "/calendar",
    response_model=calendarResponse,
    dependencies=[Depends(rate_limiter)],
)
def calendar(
    body: calendarRequest,
    x_task_id: str = Header(..., alias="x-task-id")
):
    """
    Returns an array of all available dates for a venue between start_date and end_date.
    This wraps Resy /4/calendar.
    """
    resy_client = client_manager.get_resy_client(x_task_id)
    try:
        res_json = resy_client.get_calendar(
            venue_id=str(body.venue_id),
            start_date=body.start_date,
            end_date=body.end_date,
            num_seats=body.num_seats,
        )
    except ResyClientError as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e.message}")

    available_dates = [
            x["date"] for x in res_json.get("scheduled", [])
            if x.get("inventory", {}).get("reservation") == "available"
        ]

    return calendarResponse(
        dates=available_dates,
    )