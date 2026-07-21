from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, Request, Response
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import csv
import io
import re
import asyncio
import jwt
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Google Places API key
GOOGLE_PLACES_API_KEY = os.environ.get('GOOGLE_PLACES_API_KEY', '')

# Short.io config
SHORTIO_API_KEY = os.environ.get('SHORTIO_API_KEY', '')
SHORTIO_DOMAIN = os.environ.get('SHORTIO_DOMAIN', '')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT config
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7  # 7 days
ACCESS_COOKIE_NAME = "mdc_access_token"
COOKIE_MAX_AGE = ACCESS_TOKEN_EXPIRE_HOURS * 3600
# In production behind HTTPS the cookie should be Secure. Preview/local stays lax.
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookie(response, token: str) -> None:
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


def clear_auth_cookie(response) -> None:
    response.delete_cookie(key=ACCESS_COOKIE_NAME, path="/")


async def get_current_user(request: Request) -> dict:
    # 1) Preferred: httpOnly cookie (resistant to XSS)
    token = request.cookies.get(ACCESS_COOKIE_NAME)
    # 2) Fallback: Authorization Bearer (used by tests / API clients)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user_id = payload.get("sub")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# App Configuration
APP_VERSION = "1.0.0"
API_VERSION = "Google Places API (New) v1"
BUILD_DATE = "2026-01-30"

# Default Category to Google Place Types mapping
DEFAULT_CATEGORY_TYPES = {
    "thrill_seeking": ["amusement_park", "bowling_alley", "tourist_attraction"],
    "super_chill": ["spa", "park", "zoo", "aquarium", "tourist_attraction"],
    "creative": ["museum", "art_gallery", "tourist_attraction"],
    "pure_entertainment": ["movie_theater", "night_club", "stadium", "performing_arts_theater"],
    "foodie": ["restaurant", "cafe", "bar", "meal_takeaway"]
}

# Default Category search keywords
DEFAULT_CATEGORY_KEYWORDS = {
    "thrill_seeking": "axe throwing OR go kart OR karting OR escape room OR rock climbing gym OR bouldering OR zipline OR aerial adventure park OR ropes course OR paintball OR airsoft OR skydiving OR indoor skydiving OR water park OR theme park OR surf lessons OR ski resort OR jet ski rental OR whitewater rafting OR ATV tours OR trampoline park OR laser tag",
    "super_chill": "spa OR massage OR yoga studio OR pilates OR meditation center OR botanical garden OR hiking trail OR nature preserve OR mini golf OR bike trail OR bike rental OR pier OR boardwalk OR fishing charter OR city tour OR walking tour OR arcade OR barcade OR aquarium OR zoo OR scenic cruise OR harbor cruise OR golf course OR driving range",
    "creative": "paint and sip OR pottery class OR ceramics studio OR paint your own pottery OR candle making OR rug tufting OR tufting studio OR DIY workshop OR maker space OR art workshop OR woodworking class OR glassblowing class OR jewelry making OR flower bar OR immersive art OR interactive art exhibit OR selfie museum OR photo experience OR art museum OR art gallery",
    "pure_entertainment": "IMAX OR movie theater OR live music venue OR concert venue OR comedy club OR comedy show OR performing arts center OR theater OR playhouse OR arena OR stadium OR sports venue OR event venue OR symphony OR opera",
    "foodie": "restaurant OR rooftop bar OR rooftop lounge OR brunch OR speakeasy OR cocktail bar OR wine bar OR winery OR vineyard OR brewery OR taproom OR distillery OR food tour OR tasting tour OR cooking class OR culinary school OR food hall OR public market OR dinner cruise OR dessert bar OR afternoon tea"
}

# Runtime config (can be modified via API)
CATEGORY_TYPES = DEFAULT_CATEGORY_TYPES.copy()
CATEGORY_KEYWORDS = DEFAULT_CATEGORY_KEYWORDS.copy()


# Models
class Photo(BaseModel):
    url: str
    height: int = 400
    width: int = 400


class PlaceResult(BaseModel):
    id: str
    name: str
    address: str
    latitude: float
    longitude: float
    website: Optional[str] = None
    phone: Optional[str] = None
    instagram: Optional[str] = None
    description: Optional[str] = None
    photos: List[Photo] = []
    rating: Optional[float] = None
    price_range: Optional[str] = None
    category: str = ""


class SearchRequest(BaseModel):
    category: str = ""  # Single category (backwards compat)
    categories: List[str] = []  # Multiple categories
    location: str = ""  # City, area, or zip code
    region: str = ""  # Optional region filter
    location_names: List[str] = []  # Optional specific location names (up to 10)
    page: int = 1
    per_page: int = 20


# US Regions mapping
US_REGIONS = {
    "northeast": {
        "name": "Northeast Region",
        "states": ["Connecticut", "Maine", "Massachusetts", "New Hampshire", "Rhode Island", "Vermont", "New Jersey", "New York", "Pennsylvania"]
    },
    "southeast": {
        "name": "Southeast Region", 
        "states": ["Alabama", "Florida", "Georgia", "Kentucky", "Mississippi", "North Carolina", "South Carolina", "Tennessee", "Virginia", "West Virginia", "Maryland", "Delaware", "District of Columbia"]
    },
    "midwest": {
        "name": "Midwest Region",
        "states": ["Illinois", "Indiana", "Michigan", "Ohio", "Wisconsin", "Iowa", "Kansas", "Minnesota", "Missouri", "Nebraska", "North Dakota", "South Dakota"]
    },
    "southwest": {
        "name": "Southwest Region",
        "states": ["Arizona", "Arkansas", "Louisiana", "New Mexico", "Oklahoma", "Texas"]
    },
    "west_coast": {
        "name": "West Coast Region",
        "states": ["California", "Oregon", "Washington", "Nevada", "Idaho", "Montana", "Utah", "Wyoming", "Colorado", "Alaska", "Hawaii"]
    }
}


class SearchResponse(BaseModel):
    success: bool
    places: List[PlaceResult]
    total: int
    page: int
    per_page: int
    total_pages: int


class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    created_at: str


# Configuration Models
class CategoryConfig(BaseModel):
    category_id: str
    place_types: List[str]
    keywords: str


class ConfigUpdate(BaseModel):
    category_id: str
    place_types: Optional[List[str]] = None
    keywords: Optional[str] = None


class SearchHistoryResult(BaseModel):
    name: str
    address: str
    website: Optional[str] = None


class SearchHistoryEntry(BaseModel):
    id: str
    timestamp: str
    category: str
    search_method: str
    location: str
    region: str
    location_names: List[str]
    results_count: int
    results: List[SearchHistoryResult]


# Price level mapping from Google Places API
PRICE_LEVEL_MAP = {
    "PRICE_LEVEL_FREE": "$",
    "PRICE_LEVEL_INEXPENSIVE": "$",
    "PRICE_LEVEL_MODERATE": "$$",
    "PRICE_LEVEL_EXPENSIVE": "$$$",
    "PRICE_LEVEL_VERY_EXPENSIVE": "$$$",
}


def map_price_level(place_data: dict) -> Optional[str]:
    """Map Google Places priceLevel to $/$$/$$$ format."""
    level = place_data.get("priceLevel", "")
    return PRICE_LEVEL_MAP.get(level)


# Helper function to extract Instagram from website or editorial summary
def extract_instagram(place_data: dict) -> Optional[str]:
    """Try to extract Instagram handle from place data"""
    website = place_data.get("websiteUri", "")
    if website and "instagram.com" in website.lower():
        return website
    return None


# Regex patterns to find Instagram links in HTML
INSTAGRAM_PATTERNS = [
    re.compile(r'href=["\'](?:https?://)?(?:www\.)?instagram\.com/([a-zA-Z0-9_.]+)/?["\']', re.IGNORECASE),
    re.compile(r'(?:https?://)?(?:www\.)?instagram\.com/([a-zA-Z0-9_.]+)/?', re.IGNORECASE),
]

# Handles to skip (not real user profiles)
INSTAGRAM_SKIP = {'explore', 'p', 'reel', 'reels', 'stories', 'accounts', 'direct', 'about', 'developer', 'legal', 'privacy', 'terms', 'api', 'press', ''}


def parse_instagram_handle(html: str) -> Optional[str]:
    """Extract Instagram handle from HTML content."""
    # First try href-based pattern (more reliable, from actual links)
    for pattern in INSTAGRAM_PATTERNS:
        matches = pattern.findall(html)
        for match in matches:
            handle = match.strip().rstrip('/').lower()
            if handle and handle not in INSTAGRAM_SKIP and len(handle) <= 30:
                return handle
    return None


async def scrape_instagram_from_website(http_client: httpx.AsyncClient, website_url: str) -> Optional[str]:
    """Fetch a business website and extract Instagram handle from its HTML."""
    if not website_url:
        return None
    try:
        response = await http_client.get(
            website_url,
            follow_redirects=True,
            timeout=5.0,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        if response.status_code == 200:
            # Only parse first 200KB to avoid huge pages
            html = response.text[:200000]
            return parse_instagram_handle(html)
    except Exception:
        pass
    return None


async def enrich_places_with_instagram(places: list, http_client: httpx.AsyncClient) -> list:
    """Concurrently scrape Instagram handles for all places that don't have one."""
    tasks = []
    indices = []
    for i, place in enumerate(places):
        if not place.instagram and place.website:
            tasks.append(scrape_instagram_from_website(http_client, place.website))
            indices.append(i)

    if not tasks:
        return places

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for idx, result in zip(indices, results):
        if isinstance(result, str) and result:
            handle = result
            places[idx].instagram = f"https://instagram.com/{handle}"
    return places


# ---- Google Place Photo URL resolution ----
# The /v1/{photo_name}/media endpoint serves a 302 redirect to a lh3.googleusercontent.com URL.
# For CSV exports we resolve to the final googleusercontent URL so:
#   1) the API key is NOT leaked in the exported file
#   2) the URL renders directly in any context (Sheets, browsers, email previewers)
# Google supports `?skipHttpRedirect=true` which returns JSON `{ "photoUri": "https://lh3.googleusercontent.com/..." }`.

_PLACE_PHOTO_NAME_RE = re.compile(r"places/[^/]+/photos/[^/?#]+")


def _extract_photo_name(url: str) -> Optional[str]:
    """Return the `places/{id}/photos/{name}` resource path embedded in a Photo API URL."""
    if not url:
        return None
    match = _PLACE_PHOTO_NAME_RE.search(url)
    return match.group(0) if match else None


async def resolve_place_photo_url(
    http_client: httpx.AsyncClient,
    photo_url: str,
    max_width: int = 600,
    max_height: int = 400,
) -> str:
    """Resolve a Google Places photo URL to its underlying googleusercontent.com URL.

    Falls back to the input URL on any failure so the caller still has *something* renderable.
    Non-Google URLs are returned unchanged.
    """
    if not photo_url or "places.googleapis.com" not in photo_url:
        return photo_url
    if not GOOGLE_PLACES_API_KEY:
        return photo_url

    photo_name = _extract_photo_name(photo_url)
    if not photo_name:
        return photo_url

    try:
        response = await http_client.get(
            f"https://places.googleapis.com/v1/{photo_name}/media",
            params={
                "maxWidthPx": max_width,
                "maxHeightPx": max_height,
                "skipHttpRedirect": "true",
                "key": GOOGLE_PLACES_API_KEY,
            },
            timeout=5.0,
        )
        if response.status_code == 200:
            data = response.json()
            resolved = data.get("photoUri")
            if resolved:
                return resolved
    except Exception as e:
        logger.warning(f"Photo resolution failed for {photo_name}: {e}")
    return photo_url


async def resolve_photo_urls_bulk(urls: List[str]) -> List[str]:
    """Resolve up to N photo URLs concurrently. Preserves order."""
    if not urls:
        return urls
    semaphore = asyncio.Semaphore(10)
    async with httpx.AsyncClient() as client:
        async def bounded(u: str) -> str:
            async with semaphore:
                return await resolve_place_photo_url(client, u)
        return await asyncio.gather(*(bounded(u) for u in urls))


@api_router.get("/")
async def root():
    return {"message": "Google Maps Location Scraper API"}


# User Authentication Endpoints
@api_router.post("/auth/register")
async def register_user(user: UserCreate, response: Response):
    """Register a new user and return an access token (also set as httpOnly cookie)"""
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user.email.lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Hash password and create user
    hashed_password = pwd_context.hash(user.password)
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": user.email.lower(),
        "password": hashed_password,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.users.insert_one(user_doc)

    token = create_access_token(user_doc["id"], user_doc["email"])
    set_auth_cookie(response, token)
    return {
        "success": True,
        "access_token": token,  # kept for API/test clients; cookie is used by browser
        "token_type": "bearer",
        "user": {
            "id": user_doc["id"],
            "email": user_doc["email"],
            "created_at": user_doc["created_at"],
        },
    }


@api_router.post("/auth/login")
async def login_user(user: UserLogin, response: Response):
    """Login user and return an access token (also set as httpOnly cookie)"""
    db_user = await db.users.find_one({"email": user.email.lower()})

    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not pwd_context.verify(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(db_user["id"], db_user["email"])
    set_auth_cookie(response, token)
    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": db_user["id"],
            "email": db_user["email"],
        },
    }


@api_router.post("/auth/logout")
async def logout_user(response: Response):
    """Clear the auth cookie."""
    clear_auth_cookie(response)
    return {"success": True}


@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get the currently authenticated user"""
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "created_at": current_user.get("created_at"),
    }


@api_router.get("/users", response_model=List[UserResponse])
async def get_users():
    """Get all users"""
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(100)
    return [UserResponse(id=u["id"], email=u["email"], created_at=u["created_at"]) for u in users]


# Configuration Endpoints
@api_router.get("/config")
async def get_config():
    """Get application configuration"""
    return {
        "app_version": APP_VERSION,
        "api_version": API_VERSION,
        "build_date": BUILD_DATE,
        "tech_stack": {
            "frontend": "React 18 + Tailwind CSS + shadcn/ui",
            "backend": "FastAPI + Motor (async MongoDB)",
            "database": "MongoDB",
            "external_api": "Google Places API (New)"
        },
        "protocol": {
            "search_method": "Text Search API with category-specific keywords",
            "deduplication": "Place ID + Name/Address combination",
            "filtering": "Requires address, website, and photos",
            "pagination": "20 results per page, max 60 total per search"
        },
        "categories": {
            category_id: {
                "place_types": CATEGORY_TYPES.get(category_id, []),
                "keywords": CATEGORY_KEYWORDS.get(category_id, "")
            }
            for category_id in CATEGORY_TYPES.keys()
        }
    }


@api_router.put("/config/category")
async def update_category_config(config: ConfigUpdate, current_user: dict = Depends(get_current_user)):
    """Update category configuration"""
    global CATEGORY_TYPES, CATEGORY_KEYWORDS
    
    if config.category_id not in DEFAULT_CATEGORY_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {config.category_id}")
    
    if config.place_types is not None:
        CATEGORY_TYPES[config.category_id] = config.place_types
    
    if config.keywords is not None:
        CATEGORY_KEYWORDS[config.category_id] = config.keywords
    
    # Store in database for persistence
    await db.config.update_one(
        {"category_id": config.category_id},
        {"$set": {
            "category_id": config.category_id,
            "place_types": CATEGORY_TYPES[config.category_id],
            "keywords": CATEGORY_KEYWORDS[config.category_id],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {
        "success": True,
        "message": f"Configuration updated for {config.category_id}",
        "config": {
            "place_types": CATEGORY_TYPES[config.category_id],
            "keywords": CATEGORY_KEYWORDS[config.category_id]
        }
    }


@api_router.post("/config/reset")
async def reset_config(current_user: dict = Depends(get_current_user)):
    """Reset configuration to defaults"""
    global CATEGORY_TYPES, CATEGORY_KEYWORDS
    CATEGORY_TYPES = DEFAULT_CATEGORY_TYPES.copy()
    CATEGORY_KEYWORDS = DEFAULT_CATEGORY_KEYWORDS.copy()
    await db.config.delete_many({})
    return {"success": True, "message": "Configuration reset to defaults"}


# Enhanced Search History Endpoints
@api_router.get("/history")
async def get_search_history(limit: int = Query(default=50, le=200), current_user: dict = Depends(get_current_user)):
    """Get detailed search history"""
    history = await db.search_history.find(
        {},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    return {"history": history}


@api_router.get("/history/{history_id}")
async def get_history_entry(history_id: str, current_user: dict = Depends(get_current_user)):
    """Get single history entry with full results"""
    entry = await db.search_history.find_one(
        {"id": history_id},
        {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")
    return entry


@api_router.delete("/history/{history_id}")
async def delete_history_entry(history_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a history entry"""
    result = await db.search_history.delete_one({"id": history_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="History entry not found")
    return {"success": True, "message": "History entry deleted"}


@api_router.delete("/history")
async def clear_history(current_user: dict = Depends(get_current_user)):
    """Clear all search history"""
    await db.search_history.delete_many({})
    return {"success": True, "message": "All history cleared"}


@api_router.get("/categories")
async def get_categories():
    """Return list of available categories"""
    categories = [
        {"id": "thrill_seeking", "name": "Thrill Seeking", "description": "Adventurous outings like rock climbing, theme parks, paintball"},
        {"id": "super_chill", "name": "Super Chill", "description": "Relaxing items like spas, yoga, hiking trails, golf"},
        {"id": "creative", "name": "Creative", "description": "Arts like museums, DIY arts and crafts locations, workshops"},
        {"id": "pure_entertainment", "name": "Pure Entertainment", "description": "Venues for performing arts, theaters, concert venues"},
        {"id": "foodie", "name": "Foodie", "description": "Restaurants, wineries, breweries, cooking classes"}
    ]
    return {"categories": categories}


@api_router.get("/regions")
async def get_regions():
    """Return list of US regions with their states"""
    regions = []
    for region_id, region_data in US_REGIONS.items():
        regions.append({
            "id": region_id,
            "name": region_data["name"],
            "states": region_data["states"]
        })
    return {"regions": regions}


# ---- Search helpers ----------------------------------------------------------
# Extracted from `search_places` to keep the endpoint readable.  Each helper is
# deliberately narrow: validation, Google API call, place normalization, and
# the round-robin interleave. Behaviour is identical to the pre-refactor code.

GOOGLE_PLACES_FIELDS = (
    "places.id,places.displayName,places.formattedAddress,places.location,"
    "places.websiteUri,places.internationalPhoneNumber,places.rating,"
    "places.priceLevel,places.photos,places.editorialSummary,places.types"
)


def _normalize_search_request(request: "SearchRequest"):
    """Validate the incoming request and produce (categories, location_names, search_locations)."""
    categories = request.categories if request.categories else ([request.category] if request.category else [])
    categories = [c for c in categories if c]

    for cat in categories:
        if cat not in CATEGORY_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid category '{cat}'. Valid categories: {list(CATEGORY_TYPES.keys())}",
            )

    if not categories and not request.location_names:
        raise HTTPException(
            status_code=400,
            detail="Please select a category, or use specific location names to search without one",
        )

    if not request.location and not request.region and not request.location_names:
        raise HTTPException(
            status_code=400,
            detail="Please provide a location (city/zip), region, or specific location names",
        )

    location_names = (request.location_names or [])[:10]
    search_locations: List[str] = []

    if location_names:
        search_locations.extend(loc.strip() for loc in location_names if loc.strip())

    if request.region and request.region in US_REGIONS:
        # Pick representative states for broader coverage.
        search_locations.extend(US_REGIONS[request.region]["states"][:5])

    if request.location:
        search_locations.append(request.location.strip())

    if not search_locations:
        raise HTTPException(status_code=400, detail="No valid search location provided")

    return categories, location_names, search_locations


async def _google_text_search(http_client: httpx.AsyncClient, query: str) -> list:
    """Run one Places Text Search (New) call and return the raw `places` list (empty on error)."""
    payload = {"textQuery": query, "maxResultCount": 20}
    headers = {
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": GOOGLE_PLACES_FIELDS,
    }
    response = await http_client.post(
        "https://places.googleapis.com/v1/places:searchText",
        json=payload,
        headers=headers,
    )
    if response.status_code != 200:
        logger.warning(f"Google API error for {query!r}: {response.status_code}")
        return []
    return response.json().get("places", [])


def _build_place_result(place: dict, category: str) -> Optional["PlaceResult"]:
    """Map a raw Google Place dict → PlaceResult. Returns None if a hard-required field is missing."""
    photos_data = place.get("photos", [])
    website = place.get("websiteUri")
    address = place.get("formattedAddress", "")
    if not photos_data or not website or not address or address == "Address not available":
        return None

    photos = []
    for photo in photos_data[:3]:
        photo_name = photo.get("name", "")
        if photo_name:
            photo_url = (
                f"https://places.googleapis.com/v1/{photo_name}/media"
                f"?maxHeightPx=400&maxWidthPx=600&key={GOOGLE_PLACES_API_KEY}"
            )
            photos.append(Photo(url=photo_url, height=400, width=600))

    coords = place.get("location", {}) or {}
    editorial = place.get("editorialSummary", {}) or {}

    return PlaceResult(
        id=place.get("id", str(uuid.uuid4())),
        name=place.get("displayName", {}).get("text", "Unknown"),
        address=address,
        latitude=coords.get("latitude", 0),
        longitude=coords.get("longitude", 0),
        website=website,
        phone=place.get("internationalPhoneNumber"),
        instagram=extract_instagram(place),
        description=editorial.get("text", ""),
        photos=photos,
        rating=place.get("rating"),
        price_range=map_price_level(place),
        category=category,
    )


def _add_places_deduped(
    raw_places: list,
    category: str,
    accumulator: list,
    seen_ids: set,
    seen_name_addr: set,
) -> None:
    """Normalize + dedupe raw Google places into the accumulator list."""
    for place in raw_places:
        result = _build_place_result(place, category)
        if result is None:
            continue
        pid = place.get("id")
        name_addr_key = f"{result.name}|{result.address}".lower()
        if pid in seen_ids or name_addr_key in seen_name_addr:
            continue
        seen_ids.add(pid)
        seen_name_addr.add(name_addr_key)
        accumulator.append(result)


def _interleave_by_category(all_places: list, categories: list) -> list:
    """Round-robin the results so Page 1 shows a balanced mix across categories."""
    if len(categories) <= 1:
        return all_places
    buckets: dict = {c: [] for c in categories}
    others: list = []
    for p in all_places:
        (buckets.get(p.category) if p.category in buckets else others).append(p) if p.category not in buckets else buckets[p.category].append(p)
    # Simpler / clearer than the ternary above:
    buckets = {c: [] for c in categories}
    others = []
    for p in all_places:
        if p.category in buckets:
            buckets[p.category].append(p)
        else:
            others.append(p)
    interleaved: list = []
    while any(buckets[c] for c in categories):
        for c in categories:
            if buckets[c]:
                interleaved.append(buckets[c].pop(0))
    return interleaved + others


async def _persist_search_history(
    request: "SearchRequest",
    categories: list,
    location_names: list,
    places: list,
) -> None:
    """Store a lightweight history record so /history can list past searches."""
    if request.region:
        search_method = "region"
    elif request.location_names:
        search_method = "specific"
    else:
        search_method = "location"

    history_results = [{"name": p.name, "address": p.address, "website": p.website} for p in places]
    doc = {
        "id": str(uuid.uuid4()),
        "category": ",".join(categories) if categories else "",
        "search_method": search_method,
        "location": request.location,
        "region": request.region,
        "location_names": location_names,
        "results_count": len(places),
        "results": history_results,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.search_history.insert_one(doc)


@api_router.post("/places/search", response_model=SearchResponse)
async def search_places(request: SearchRequest):
    """Search for places based on category and location"""
    if not GOOGLE_PLACES_API_KEY:
        logger.error("Google Places API key not configured")
        raise HTTPException(
            status_code=500,
            detail="Google Places API is not configured. Please add GOOGLE_PLACES_API_KEY to backend/.env",
        )

    categories, location_names, search_locations = _normalize_search_request(request)

    # No category ⇒ specific-place lookup; text_query is the location name itself.
    is_direct_search = not categories and bool(request.location_names)
    category_list = categories if categories else [""]

    # Scale the result cap by number of categories so each one gets a fair share.
    max_total_results = max(60, 60 * len(category_list))

    try:
        all_places: list = []
        seen_ids: set = set()
        seen_name_addr: set = set()

        async with httpx.AsyncClient(timeout=30.0) as http_client:
            for current_category in category_list:
                keywords = CATEGORY_KEYWORDS.get(current_category, "") if current_category else ""

                # Pass 1: keyword-based search per location
                for search_location in search_locations:
                    if len(all_places) >= max_total_results:
                        break
                    text_query = search_location if is_direct_search else f"{keywords} in {search_location}"
                    raw = await _google_text_search(http_client, text_query)
                    _add_places_deduped(raw, current_category, all_places, seen_ids, seen_name_addr)

                # Pass 2: additional place-type searches to broaden results
                place_types = CATEGORY_TYPES.get(current_category, []) if current_category else []
                for place_type in place_types[:2]:
                    if len(all_places) >= max_total_results:
                        break
                    anchor = search_locations[0] if search_locations else ""
                    if not anchor:
                        break
                    raw = await _google_text_search(http_client, f"{place_type} in {anchor}")
                    _add_places_deduped(raw, current_category, all_places, seen_ids, seen_name_addr)

        # Enrichment + ordering
        async with httpx.AsyncClient(timeout=10.0) as ig_client:
            all_places = await enrich_places_with_instagram(all_places, ig_client)
        all_places = _interleave_by_category(all_places, categories)

        await _persist_search_history(request, categories, location_names, all_places)

        # Pagination
        total = len(all_places)
        per_page = request.per_page
        total_pages = (total + per_page - 1) // per_page if total > 0 else 1
        page = max(1, min(request.page, total_pages))
        start = (page - 1) * per_page
        return SearchResponse(
            success=True,
            places=all_places[start:start + per_page],
            total=total,
            page=page,
            per_page=per_page,
            total_pages=total_pages,
        )

    except httpx.RequestError as e:
        logger.error(f"Request error: {e}")
        raise HTTPException(status_code=502, detail="Failed to connect to Google Places API")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")


# ---- Legacy monolithic body removed; helpers above cover every code path ----


@api_router.post("/places/export-csv")
async def export_places_to_csv(places: List[PlaceResult]):
    """Export places to CSV file"""
    
    # Experience Type mapping (category_id to display name)
    EXPERIENCE_TYPE_NAMES = {
        "thrill_seeking": "Thrill Seeking",
        "super_chill": "Super Chill",
        "creative": "Creative",
        "pure_entertainment": "Pure Entertainment",
        "foodie": "Foodie"
    }
    
    # Category hex color mapping
    CATEGORY_COLORS = {
        "thrill_seeking": "#E63946",
        "super_chill": "#84A98C",
        "creative": "#0F8FA8",
        "pure_entertainment": "#9B5DE5",
        "foodie": "#F4A261",
        # Also map display names for backwards compatibility
        "Thrill Seeking": "#E63946",
        "Super Chill": "#84A98C",
        "Creative": "#0F8FA8",
        "Pure Entertainment": "#9B5DE5",
        "Foodie": "#F4A261",
    }
    
    output = io.StringIO()
    writer = csv.writer(output)

    # Resolve any /v1/{photo_name}/media URLs to their canonical lh3.googleusercontent.com
    # form so the CSV: (a) doesn't leak the API key, (b) renders in any tool that opens it.
    photo_index = []  # (place_idx, photo_idx, original_url)
    photos_to_resolve: List[str] = []
    for p_idx, place in enumerate(places):
        for ph_idx, photo in enumerate(place.photos or []):
            if photo.url and "places.googleapis.com" in photo.url:
                photo_index.append((p_idx, ph_idx, photo.url))
                photos_to_resolve.append(photo.url)

    resolved_map: dict = {}
    if photos_to_resolve:
        try:
            resolved = await resolve_photo_urls_bulk(photos_to_resolve)
            for (_, _, orig), final in zip(photo_index, resolved):
                resolved_map[orig] = final
        except Exception as e:
            logger.warning(f"Bulk photo resolution failed: {e}")

    # Write header
    writer.writerow([
        "Category",
        "Name",
        "Address",
        "Latitude",
        "Longitude",
        "Website URL",
        "Phone",
        "Instagram",
        "Description",
        "Color",
        "Rating",
        "Price Range",
        "Image 1",
        "Image 2",
        "Image 3",
        "Is Staff Pick",
    ])
    
    # Write data
    for place in places:
        photos = place.photos if place.photos else []
        # Substitute each photo URL with its resolved CDN URL if we have one.
        photo_urls = [resolved_map.get(p.url, p.url) for p in photos]
        # Get experience type display name, default to empty if not found
        experience_type = EXPERIENCE_TYPE_NAMES.get(place.category, place.category or "")
        # Extract Instagram handle only (no @ or full URL)
        ig_handle = ""
        if place.instagram:
            ig_url = place.instagram.lower().rstrip('/')
            # Extract handle from URL like https://instagram.com/handle
            ig_match = re.search(r'instagram\.com/([a-zA-Z0-9_.]+)', ig_url)
            if ig_match:
                ig_handle = ig_match.group(1)
            else:
                # If it's already just a handle
                ig_handle = place.instagram.lstrip('@')
        # Get hex color for the category
        category_color = CATEGORY_COLORS.get(place.category, CATEGORY_COLORS.get(experience_type, ""))
        writer.writerow([
            experience_type,
            place.name,
            place.address,
            place.latitude,
            place.longitude,
            place.website or "",
            place.phone or "",
            ig_handle,
            place.description or "",
            category_color,
            place.rating or "",
            place.price_range or "",
            photo_urls[0] if len(photo_urls) > 0 else "",
            photo_urls[1] if len(photo_urls) > 1 else "",
            photo_urls[2] if len(photo_urls) > 2 else "",
            0,  # Is Staff Pick (default)
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=locations.csv"}
    )


@api_router.get("/search-history")
async def get_search_history(limit: int = Query(default=10, le=100), current_user: dict = Depends(get_current_user)):
    """Get recent search history"""
    history = await db.search_history.find(
        {},
        {"_id": 0, "id": 1, "category": 1, "location": 1, "results_count": 1, "timestamp": 1}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    return {"history": history}




# ======== AI DESCRIPTION GENERATION ========

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')


class GenerateDescRequest(BaseModel):
    places: List[dict]  # [{"id": "place_id", "name": "...", "address": "...", "category": "..."}]


@api_router.post("/generate-descriptions")
async def generate_descriptions(request: GenerateDescRequest):
    """Generate short descriptions for locations missing them, using Gemini."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    # Run up to 10 LLM calls concurrently and cap each at 25s so one slow
    # request can never block the entire batch (avoids ingress timeout).
    semaphore = asyncio.Semaphore(10)

    async def gen_one(item: dict) -> dict:
        place_id = item.get("id", "")
        name = item.get("name", "")
        address = item.get("address", "")
        cat = item.get("category", "")
        if not name:
            return {"id": place_id, "description": None, "success": False, "error": "Missing name"}

        async with semaphore:
            try:
                chat = LlmChat(
                    api_key=EMERGENT_LLM_KEY,
                    session_id=f"desc-{uuid.uuid4()}",
                    system_message="You are a concise location description writer. Write engaging, factual mini-descriptions for businesses and places. Keep descriptions under 500 characters. Output the description text directly with no quotes."
                ).with_model("gemini", "gemini-2.5-flash")

                prompt = f"Write a short, engaging description (max 500 chars) for: {name}"
                if address:
                    prompt += f" at {address}"
                if cat:
                    prompt += f" (Category: {cat})"

                response = await asyncio.wait_for(
                    chat.send_message(UserMessage(text=prompt)),
                    timeout=25.0,
                )
                desc = (response or "").strip().strip('"').strip("'")
                if not desc:
                    return {"id": place_id, "description": None, "success": False, "error": "Empty response"}
                if len(desc) > 500:
                    desc = desc[:497] + "..."
                return {"id": place_id, "description": desc, "success": True}
            except asyncio.TimeoutError:
                logger.warning(f"Description gen timeout for {name}")
                return {"id": place_id, "description": None, "success": False, "error": "Timeout"}
            except Exception as e:
                logger.error(f"Description gen error for {name}: {e}")
                return {"id": place_id, "description": None, "success": False, "error": str(e)}

    results = await asyncio.gather(*(gen_one(item) for item in request.places))
    succeeded = sum(1 for r in results if r["success"])
    return {"success": True, "results": results, "generated": succeeded, "total": len(results)}


# ======== SHORT.IO LINK SHORTENING ========

class ShortenRequest(BaseModel):
    urls: List[dict]  # [{"id": "place_id", "url": "https://..."}]


class ShortenResult(BaseModel):
    id: str
    original_url: str
    short_url: Optional[str] = None
    success: bool = False
    error: Optional[str] = None


@api_router.post("/shorten-links")
async def shorten_links(request: ShortenRequest):
    """Shorten multiple URLs using short.io"""
    if not SHORTIO_API_KEY or not SHORTIO_DOMAIN:
        raise HTTPException(status_code=500, detail="Short.io is not configured")

    results = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        for item in request.urls:
            place_id = item.get("id", "")
            original_url = item.get("url", "")
            if not original_url:
                results.append(ShortenResult(id=place_id, original_url="", success=False, error="No URL"))
                continue
            try:
                resp = await client.post(
                    "https://api.short.io/links",
                    headers={
                        "Authorization": SHORTIO_API_KEY,
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    json={
                        "originalURL": original_url,
                        "domain": SHORTIO_DOMAIN,
                        "allowDuplicates": False,
                    },
                )
                data = resp.json()
                if resp.status_code in (200, 201) and data.get("shortURL"):
                    results.append(ShortenResult(
                        id=place_id,
                        original_url=original_url,
                        short_url=data["shortURL"],
                        success=True,
                    ))
                else:
                    # Duplicate link — short.io returns the existing one
                    if data.get("shortURL"):
                        results.append(ShortenResult(
                            id=place_id, original_url=original_url,
                            short_url=data["shortURL"], success=True,
                        ))
                    else:
                        err = data.get("message") or data.get("error") or str(resp.status_code)
                        results.append(ShortenResult(
                            id=place_id, original_url=original_url,
                            success=False, error=err,
                        ))
            except Exception as e:
                results.append(ShortenResult(
                    id=place_id, original_url=original_url,
                    success=False, error=str(e),
                ))

    succeeded = sum(1 for r in results if r.success)
    return {"success": True, "results": [r.model_dump() for r in results], "shortened": succeeded, "total": len(results)}


@api_router.get("/shorten-status")
async def get_shorten_status():
    """Check if short.io is configured and reachable."""
    def _mask(key: str) -> str:
        if not key:
            return ""
        if len(key) <= 8:
            return "*" * len(key)
        return f"{key[:4]}{'*' * (len(key) - 8)}{key[-4:]}"

    masked = _mask(SHORTIO_API_KEY)
    if not SHORTIO_API_KEY or not SHORTIO_DOMAIN:
        return {"connected": False, "domain": "", "api_key_masked": masked, "error": "Not configured"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                "https://api.short.io/links",
                headers={"Authorization": SHORTIO_API_KEY, "Content-Type": "application/json"},
                json={"originalURL": "https://short.io", "domain": SHORTIO_DOMAIN, "allowDuplicates": False},
            )
            if resp.status_code in (200, 201, 409):
                return {"connected": True, "domain": SHORTIO_DOMAIN, "api_key_masked": masked, "error": None}
            else:
                return {"connected": False, "domain": SHORTIO_DOMAIN, "api_key_masked": masked, "error": f"Status {resp.status_code}"}
    except Exception as e:
        return {"connected": False, "domain": SHORTIO_DOMAIN, "api_key_masked": masked, "error": str(e)}



@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks(limit: int = Query(default=100, le=1000)):
    status_checks = await db.status_checks.find(
        {}, 
        {"_id": 0, "id": 1, "client_name": 1, "timestamp": 1}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[
        o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()
    ] or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def seed_admin_user():
    """Ensure the configured admin account exists and has the current password.

    Idempotent: creates the user if missing, or rehashes the password if the env
    value changed. Never logs the plaintext password.
    """
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if not admin_email or not admin_password:
        logger.info("Admin seeding skipped: ADMIN_EMAIL / ADMIN_PASSWORD not set")
        return
    try:
        existing = await db.users.find_one({"email": admin_email})
        if existing is None:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": admin_email,
                "password": pwd_context.hash(admin_password),
                "role": "admin",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Seeded admin user {admin_email}")
        elif not pwd_context.verify(admin_password, existing["password"]):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"password": pwd_context.hash(admin_password), "role": "admin"}},
            )
            logger.info(f"Updated admin password for {admin_email}")
        elif existing.get("role") != "admin":
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"role": "admin"}},
            )
            logger.info(f"Promoted {admin_email} to admin role")
    except Exception as e:
        logger.error(f"Admin seeding failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
