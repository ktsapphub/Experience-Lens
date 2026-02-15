from fastapi import FastAPI, APIRouter, HTTPException, Query
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
from datetime import datetime, timezone
import httpx
import csv
import io
import re
import asyncio
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Google Places API key
GOOGLE_PLACES_API_KEY = os.environ.get('GOOGLE_PLACES_API_KEY', '')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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
    category: str = ""


class SearchRequest(BaseModel):
    category: str = ""  # Optional for specific location searches
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


@api_router.get("/")
async def root():
    return {"message": "Google Maps Location Scraper API"}


# User Authentication Endpoints
@api_router.post("/auth/register", response_model=UserResponse)
async def register_user(user: UserCreate):
    """Register a new user"""
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
    
    return UserResponse(
        id=user_doc["id"],
        email=user_doc["email"],
        created_at=user_doc["created_at"]
    )


@api_router.post("/auth/login")
async def login_user(user: UserLogin):
    """Login user"""
    db_user = await db.users.find_one({"email": user.email.lower()})
    
    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not pwd_context.verify(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    return {
        "success": True,
        "message": "Login successful",
        "user": {
            "id": db_user["id"],
            "email": db_user["email"]
        }
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
async def update_category_config(config: ConfigUpdate):
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
async def reset_config():
    """Reset configuration to defaults"""
    global CATEGORY_TYPES, CATEGORY_KEYWORDS
    CATEGORY_TYPES = DEFAULT_CATEGORY_TYPES.copy()
    CATEGORY_KEYWORDS = DEFAULT_CATEGORY_KEYWORDS.copy()
    await db.config.delete_many({})
    return {"success": True, "message": "Configuration reset to defaults"}


# Enhanced Search History Endpoints
@api_router.get("/history")
async def get_search_history(limit: int = Query(default=50, le=200)):
    """Get detailed search history"""
    history = await db.search_history.find(
        {},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    return {"history": history}


@api_router.get("/history/{history_id}")
async def get_history_entry(history_id: str):
    """Get single history entry with full results"""
    entry = await db.search_history.find_one(
        {"id": history_id},
        {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")
    return entry


@api_router.delete("/history/{history_id}")
async def delete_history_entry(history_id: str):
    """Delete a history entry"""
    result = await db.search_history.delete_one({"id": history_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="History entry not found")
    return {"success": True, "message": "History entry deleted"}


@api_router.delete("/history")
async def clear_history():
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


@api_router.post("/places/search", response_model=SearchResponse)
async def search_places(request: SearchRequest):
    """Search for places based on category and location"""
    
    if not GOOGLE_PLACES_API_KEY:
        logger.error("Google Places API key not configured")
        raise HTTPException(
            status_code=500,
            detail="Google Places API is not configured. Please add GOOGLE_PLACES_API_KEY to backend/.env"
        )
    
    if request.category and request.category not in CATEGORY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Valid categories: {list(CATEGORY_TYPES.keys())}"
        )
    
    # Category is required unless searching by specific location names
    if not request.category and not request.location_names:
        raise HTTPException(
            status_code=400,
            detail="Please select a category, or use specific location names to search without one"
        )
    
    # Validate at least one location method is provided
    if not request.location and not request.region and not request.location_names:
        raise HTTPException(
            status_code=400,
            detail="Please provide a location (city/zip), region, or specific location names"
        )
    
    # Limit location names to 10
    location_names = request.location_names[:10] if request.location_names else []
    
    # Build list of locations to search
    search_locations = []
    
    # If specific location names provided, use those
    if location_names:
        for loc_name in location_names:
            if loc_name.strip():
                search_locations.append(loc_name.strip())
    
    # If region is selected, use states from that region
    if request.region and request.region in US_REGIONS:
        region_states = US_REGIONS[request.region]["states"]
        # Pick representative cities/states for broader coverage
        for state in region_states[:5]:  # Limit to first 5 states for performance
            search_locations.append(state)
    
    # If single location/zip provided
    if request.location:
        search_locations.append(request.location.strip())
    
    # Default to first location if multiple provided
    if not search_locations:
        raise HTTPException(
            status_code=400,
            detail="No valid search location provided"
        )
    
    try:
        all_places = []
        seen_ids = set()  # Track unique place IDs to prevent duplicates
        seen_names_addresses = set()  # Track name+address combos for additional dedup
        
        # Get keywords for this category (empty if no category)
        keywords = CATEGORY_KEYWORDS.get(request.category, "") if request.category else ""
        
        # Determine if this is a direct location name search (no category)
        is_direct_search = not request.category and bool(request.location_names)
        
        headers = {
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.internationalPhoneNumber,places.rating,places.photos,places.editorialSummary,places.types"
        }
        
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            # Search across all provided locations
            for search_location in search_locations:
                if len(all_places) >= 60:  # Cap total results
                    break
                
                # Use Text Search API (New) for better results
                # Direct search uses location name as-is; category search prepends keywords
                if is_direct_search:
                    text_query = search_location
                else:
                    text_query = f"{keywords} in {search_location}"
                
                search_payload = {
                    "textQuery": text_query,
                    "maxResultCount": 20
                }
                
                response = await http_client.post(
                    "https://places.googleapis.com/v1/places:searchText",
                    json=search_payload,
                    headers=headers
                )
                
                if response.status_code != 200:
                    logger.warning(f"Google API error for {search_location}: {response.status_code}")
                    continue
                
                data = response.json()
                
                for place in data.get("places", []):
                    # Skip places without photos
                    photos_data = place.get("photos", [])
                    if not photos_data:
                        continue
                    
                    # Skip places without website
                    website = place.get("websiteUri")
                    if not website:
                        continue
                    
                    # Skip places without proper address
                    address = place.get("formattedAddress", "")
                    if not address or address == "Address not available":
                        continue
                    
                    # Build photo URLs (up to 3)
                    photos = []
                    for photo in photos_data[:3]:
                        photo_name = photo.get("name", "")
                        if photo_name:
                            photo_url = f"https://places.googleapis.com/v1/{photo_name}/media?maxHeightPx=400&maxWidthPx=600&key={GOOGLE_PLACES_API_KEY}"
                            photos.append(Photo(url=photo_url, height=400, width=600))
                    
                    # Get location coordinates
                    location = place.get("location", {})
                    
                    # Get description from editorial summary
                    editorial = place.get("editorialSummary", {})
                    description = editorial.get("text", "") if editorial else ""
                    
                    place_result = PlaceResult(
                        id=place.get("id", str(uuid.uuid4())),
                        name=place.get("displayName", {}).get("text", "Unknown"),
                        address=address,
                        latitude=location.get("latitude", 0),
                        longitude=location.get("longitude", 0),
                        website=website,
                        phone=place.get("internationalPhoneNumber"),
                        instagram=extract_instagram(place),
                        description=description,
                        photos=photos,
                        rating=place.get("rating"),
                        category=request.category
                    )
                    
                    # Deduplication check by ID and name+address
                    place_id = place.get("id")
                    name_addr_key = f"{place_result.name}|{place_result.address}".lower()
                    
                    if place_id in seen_ids or name_addr_key in seen_names_addresses:
                        continue
                    
                    seen_ids.add(place_id)
                    seen_names_addresses.add(name_addr_key)
                    all_places.append(place_result)
            
            # Make additional searches with specific place types to get more results (only with category)
            place_types = CATEGORY_TYPES.get(request.category, []) if request.category else []
            
            for place_type in place_types[:2]:
                if len(all_places) >= 60:  # Cap at 60 total results
                    break
                
                # Use first search location for additional searches
                additional_location = search_locations[0] if search_locations else ""
                if not additional_location:
                    break
                    
                search_payload = {
                    "textQuery": f"{place_type} in {additional_location}",
                    "maxResultCount": 20
                }
                
                response = await http_client.post(
                    "https://places.googleapis.com/v1/places:searchText",
                    json=search_payload,
                    headers=headers
                )
                
                if response.status_code == 200:
                    data = response.json()
                    for place in data.get("places", []):
                        # Skip places without photos
                        photos_data = place.get("photos", [])
                        if not photos_data:
                            continue
                        
                        # Skip places without website
                        website = place.get("websiteUri")
                        if not website:
                            continue
                        
                        # Skip places without proper address
                        address = place.get("formattedAddress", "")
                        if not address or address == "Address not available":
                            continue
                        
                        photos = []
                        for photo in photos_data[:3]:
                            photo_name = photo.get("name", "")
                            if photo_name:
                                photo_url = f"https://places.googleapis.com/v1/{photo_name}/media?maxHeightPx=400&maxWidthPx=600&key={GOOGLE_PLACES_API_KEY}"
                                photos.append(Photo(url=photo_url, height=400, width=600))
                        
                        location = place.get("location", {})
                        editorial = place.get("editorialSummary", {})
                        description = editorial.get("text", "") if editorial else ""
                        
                        place_result = PlaceResult(
                            id=place.get("id", str(uuid.uuid4())),
                            name=place.get("displayName", {}).get("text", "Unknown"),
                            address=address,
                            latitude=location.get("latitude", 0),
                            longitude=location.get("longitude", 0),
                            website=website,
                            phone=place.get("internationalPhoneNumber"),
                            instagram=extract_instagram(place),
                            description=description,
                            photos=photos,
                            rating=place.get("rating"),
                            category=request.category
                        )
                        
                        # Deduplication check by ID and name+address
                        place_id = place.get("id")
                        name_addr_key = f"{place_result.name}|{place_result.address}".lower()
                        
                        if place_id in seen_ids or name_addr_key in seen_names_addresses:
                            continue
                        
                        seen_ids.add(place_id)
                        seen_names_addresses.add(name_addr_key)
                        all_places.append(place_result)
        
        # Enrich places with Instagram handles from their websites
        async with httpx.AsyncClient(timeout=10.0) as ig_client:
            all_places = await enrich_places_with_instagram(all_places, ig_client)

        # Store search in history with results
        # Determine search method
        search_method = "location"
        if request.region:
            search_method = "region"
        elif request.location_names and len(request.location_names) > 0:
            search_method = "specific"
        
        # Prepare results for history (text only)
        history_results = [
            {
                "name": p.name,
                "address": p.address,
                "website": p.website
            }
            for p in all_places
        ]
        
        search_history = {
            "id": str(uuid.uuid4()),
            "category": request.category,
            "search_method": search_method,
            "location": request.location,
            "region": request.region,
            "location_names": location_names,
            "results_count": len(all_places),
            "results": history_results,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.search_history.insert_one(search_history)
        
        # Pagination
        total = len(all_places)
        per_page = request.per_page
        total_pages = (total + per_page - 1) // per_page if total > 0 else 1
        page = max(1, min(request.page, total_pages))
        
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_places = all_places[start_idx:end_idx]
        
        return SearchResponse(
            success=True,
            places=paginated_places,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=total_pages
        )
    
    except httpx.RequestError as e:
        logger.error(f"Request error: {str(e)}")
        raise HTTPException(
            status_code=502,
            detail="Failed to connect to Google Places API"
        )
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


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
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header with Experience Type as first column
    writer.writerow([
        "Experience Type",
        "Name",
        "Address",
        "Latitude",
        "Longitude",
        "Website",
        "Phone",
        "Instagram",
        "Description",
        "Rating",
        "Image 1",
        "Image 2",
        "Image 3"
    ])
    
    # Write data
    for place in places:
        photos = place.photos if place.photos else []
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
        writer.writerow([
            experience_type,
            place.name,
            place.address,
            place.latitude,
            place.longitude,
            place.website or "",
            ig_handle,
            place.description or "",
            place.rating or "",
            photos[0].url if len(photos) > 0 else "",
            photos[1].url if len(photos) > 1 else "",
            photos[2].url if len(photos) > 2 else ""
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=locations.csv"}
    )


@api_router.get("/search-history")
async def get_search_history(limit: int = Query(default=10, le=100)):
    """Get recent search history"""
    history = await db.search_history.find(
        {},
        {"_id": 0, "id": 1, "category": 1, "location": 1, "results_count": 1, "timestamp": 1}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    return {"history": history}


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
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
