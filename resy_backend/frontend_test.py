# frontend_test.py
from flask import Flask, request, render_template_string
import requests
import json

app = Flask(__name__)

# ---- CONFIG ----
API_BASE = "http://127.0.0.1:8000/api/v1/resy"   # your FastAPI base
API_KEY = "super-secret-dev-key"                        # must match settings.API_KEY in your FastAPI app


def api_headers():
    return {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
    }


# ---- HTML TEMPLATE ----
PAGE_TEMPLATE = """
<!doctype html>
<html>
<head>
    <title>Resy Test Frontend</title>
    <style>
        body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 2rem; }
        form { margin-bottom: 2rem; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; max-width: 480px; }
        label { display: block; margin-top: 0.75rem; }
        input { width: 100%; padding: 0.4rem; margin-top: 0.25rem; }
        button { margin-top: 1rem; padding: 0.5rem 1rem; cursor: pointer; }
        h2 { margin-top: 2rem; }
        pre { background: #111; color: #eee; padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; }
        .error { color: #b00020; font-weight: bold; }
        .step { margin-bottom: 1.5rem; }
        .success { color: #0a7c2f; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Resy Test Frontend</h1>
    <p>This page will call your FastAPI backend and run: <code>login → getID → slots → preview → book</code>.</p>
    <p><strong>Careful:</strong> if everything works, it will actually attempt to book a reservation.</p>

    <form method="post">
        <label>
            Resy Email
            <input type="email" name="email" required />
        </label>
        <label>
            Resy Password
            <input type="password" name="password" required />
        </label>
        <label>
            Resy Venue URL
            <input type="text" name="url" placeholder="https://resy.com/cities/..." required />
        </label>
        <label>
            Party Size
            <input type="number" name="party_size" value="2" min="1" required />
        </label>
        <label>
            Day (YYYY-MM-DD)
            <input type="text" name="day" placeholder="2025-11-13" required />
        </label>
        <label>
            Optional Time Filter (e.g. 21:30 or evening)
            <input type="text" name="time_filter" />
        </label>

        <button type="submit">Run Full Flow</button>
    </form>

    {% if error %}
        <p class="error">Error: {{ error }}</p>
    {% endif %}

    {% if results %}
        <div class="step">
            <h2>1. Login</h2>
            <p class="success">Status: {{ results.login_status }}</p>
            <pre>{{ results.login_response | safe }}</pre>
        </div>

        <div class="step">
            <h2>2. getID (venue)</h2>
            <p><strong>Venue ID:</strong> {{ results.venue_id }}<br/>
               <strong>Venue Name:</strong> {{ results.venue_name }}</p>
            <pre>{{ results.getid_response | safe }}</pre>
        </div>

        <div class="step">
            <h2>3. slots</h2>
            {% if results.slots and results.slots|length > 0 %}
                <p class="success">Found {{ results.slots|length }} slot(s). Using the first one.</p>
            {% else %}
                <p class="error">No slots found for that date / party size / filter.</p>
            {% endif %}
            <pre>{{ results.slots_response | safe }}</pre>
        </div>

        <div class="step">
            <h2>4. reservation preview</h2>
            <p><strong>Book Token:</strong> {{ results.book_token }}</p>
            <p><strong>Payment Method ID Used:</strong> {{ results.payment_method_id or "None" }}</p>
            <pre>{{ results.preview_response | safe }}</pre>
        </div>

        <div class="step">
            <h2>5. book</h2>
            <p class="success">Booking API called. Check raw response below.</p>
            <pre>{{ results.book_response | safe }}</pre>
        </div>
    {% endif %}
</body>
</html>
"""


@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "GET":
        return render_template_string(PAGE_TEMPLATE, results=None, error=None)

    # ---- Read form inputs ----
    email = request.form.get("email")
    password = request.form.get("password")
    url = request.form.get("url")
    party_size = int(request.form.get("party_size") or 2)
    day = request.form.get("day")
    time_filter = request.form.get("time_filter") or None

    try:
        # 1) LOGIN
        login_resp = requests.post(
            f"{API_BASE}/login",
            headers=api_headers(),
            data=json.dumps({"email": email, "password": password}),
            timeout=15,
        )
        login_json = login_resp.json()
        if login_resp.status_code != 200:
            raise RuntimeError(f"Login failed: {login_json}")

        # 2) GET ID (from URL)
        getid_resp = requests.post(
            f"{API_BASE}/getID",
            headers=api_headers(),
            data=json.dumps({"URL": url}),
            timeout=15,
        )
        getid_json = getid_resp.json()
        if getid_resp.status_code != 200:
            raise RuntimeError(f"getID failed: {getid_json}")

        venue_id = int(getid_json["venue_id"])
        venue_name = getid_json["venue_name"]

        # 3) SLOTS
        slot_body = {
            "venue_id": venue_id,
            "day": day,
            "num_seats": party_size,
            "time_filter": time_filter,
        }
        slots_resp = requests.post(
            f"{API_BASE}/slots",
            headers=api_headers(),
            data=json.dumps(slot_body),
            timeout=15,
        )
        slots_json = slots_resp.json()
        if slots_resp.status_code != 200:
            raise RuntimeError(f"slots failed: {slots_json}")

        slots = slots_json.get("slots", [])
        if not slots:
            # we still render the page, but don't attempt preview/book
            results = {
                "login_status": "ok",
                "login_response": json.dumps(login_json, indent=2),
                "venue_id": venue_id,
                "venue_name": venue_name,
                "getid_response": json.dumps(getid_json, indent=2),
                "slots": slots,
                "slots_response": json.dumps(slots_json, indent=2),
                "book_token": None,
                "payment_method_id": None,
                "preview_response": "No slots -> preview not attempted.",
                "book_response": "No slots -> book not attempted.",
            }
            return render_template_string(PAGE_TEMPLATE, results=results, error=None)

        # pick the first slot
        chosen_slot = slots[0]
        config_id = chosen_slot["token"]

        # 4) RESERVATION PREVIEW
        preview_body = {
            "config_id": config_id,
            "day": day,
            "party_size": party_size,
        }
        preview_resp = requests.post(
            f"{API_BASE}/reservation/preview",
            headers=api_headers(),
            data=json.dumps(preview_body),
            timeout=15,
        )
        preview_json = preview_resp.json()
        if preview_resp.status_code != 200:
            raise RuntimeError(f"preview failed: {preview_json}")

        book_token = preview_json.get("book_token")
        payment_methods = preview_json.get("payment_methods") or []
        payment_method_id = payment_methods[0].get("id") if payment_methods else None

        # 5) BOOK
        book_body = {
            "book_token": book_token,
            "payment_method_id": payment_method_id,
        }
        book_resp = requests.post(
            f"{API_BASE}/reservation/book",
            headers=api_headers(),
            data=json.dumps(book_body),
            timeout=20,
        )
        book_json = book_resp.json()
        if book_resp.status_code != 200:
            raise RuntimeError(f"book failed: {book_json}")

        results = {
            "login_status": "ok",
            "login_response": json.dumps(login_json, indent=2),
            "venue_id": venue_id,
            "venue_name": venue_name,
            "getid_response": json.dumps(getid_json, indent=2),
            "slots": slots,
            "slots_response": json.dumps(slots_json, indent=2),
            "book_token": book_token,
            "payment_method_id": payment_method_id,
            "preview_response": json.dumps(preview_json, indent=2),
            "book_response": json.dumps(book_json, indent=2),
        }
        return render_template_string(PAGE_TEMPLATE, results=results, error=None)

    except Exception as e:
        return render_template_string(PAGE_TEMPLATE, results=None, error=str(e))


if __name__ == "__main__":
    app.run(debug=True)
