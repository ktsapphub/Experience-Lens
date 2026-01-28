from fastapi import FastAPI, APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import httpx
import csv
import io

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Google Places API key
GOOGLE_PLACES_API_KEY = os.environ.get('GOOGLE_PLACES_API_KEY', '')

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

# Category to Google Place Types mapping
CATEGORY_TYPES = {
    "thrill_seeking": ["amusement_park", "bowling_alley", "stadium", "zoo", "aquarium"],
    "super_chill": ["spa", "park", "campground", "golf_course", "natural_feature"],
    "creative": ["museum", "art_gallery", "library", "book_store"],
    "pure_entertainment": ["movie_theater", "night_club", "casino", "bar"],
    "foodie": ["restaurant", "cafe", "bakery", "bar", "meal_takeaway"]
}

# Category search keywords for text search
CATEGORY_KEYWORDS = {
    "thrill_seeking": "adventure activities theme park rock climbing paintball extreme sports",
    "super_chill": "spa wellness yoga hiking trail relaxation golf retreat",
    "creative": "museum art gallery workshop crafts studio creative",
    "pure_entertainment": "theater concert venue performing arts live entertainment",
    "foodie": "restaurant winery brewery cooking class fine dining"
}


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
    instagram: Optional[str] = None
    description: Optional[str] = None
    photos: List[Photo] = []
    rating: Optional[float] = None
    category: str = ""


class SearchRequest(BaseModel):
    category: str
    location: str
    max_results: int = 50


class SearchResponse(BaseModel):
    success: bool
    places: List[PlaceResult]
    total: int


class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


# Helper function to extract Instagram from website or editorial summary
def extract_instagram(place_data: dict) -> Optional[str]:
    """Try to extract Instagram handle from place data"""
    website = place_data.get("websiteUri", "")
    if website and "instagram.com" in website.lower():
        return website
    return None


@api_router.get("/")
async def root():
    return {"message": "Google Maps Location Scraper API"}


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


@api_router.post("/places/search", response_model=SearchResponse)
async def search_places(request: SearchRequest):
    """Search for places based on category and location"""
    
    if not GOOGLE_PLACES_API_KEY:
        logger.error("Google Places API key not configured")
        raise HTTPException(
            status_code=500,
            detail="Google Places API is not configured. Please add GOOGLE_PLACES_API_KEY to backend/.env"
        )
    
    if request.category not in CATEGORY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Valid categories: {list(CATEGORY_TYPES.keys())}"
        )
    
    # Limit max results to 50
    max_results = min(request.max_results, 50)
    
    try:
        all_places = []
        
        # Get keywords for this category
        keywords = CATEGORY_KEYWORDS.get(request.category, "")
        
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            # Use Text Search API (New) for better results
            search_payload = {
                "textQuery": f"{keywords} in {request.location}",
                "maxResultCount": min(max_results, 20)  # API limit per request
            }
            
            headers = {
                "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.rating,places.photos,places.editorialSummary,places.types"
            }
            
            response = await http_client.post(
                "https://places.googleapis.com/v1/places:searchText",
                json=search_payload,
                headers=headers
            )
            
            if response.status_code != 200:
                logger.error(f"Google API error: {response.status_code} - {response.text}")
                raise HTTPException(
                    status_code=502,
                    detail=f"Google Places API error: {response.text}"
                )
            
            data = response.json()
            
            for place in data.get("places", []):
                # Build photo URLs (up to 3)
                photos = []
                for photo in place.get("photos", [])[:3]:
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
                    address=place.get("formattedAddress", "Address not available"),
                    latitude=location.get("latitude", 0),
                    longitude=location.get("longitude", 0),
                    website=place.get("websiteUri"),
                    instagram=extract_instagram(place),
                    description=description,
                    photos=photos,
                    rating=place.get("rating"),
                    category=request.category
                )
                all_places.append(place_result)
            
            # If we need more results, make additional searches with specific place types
            if len(all_places) < max_results:
                place_types = CATEGORY_TYPES.get(request.category, [])
                
                for place_type in place_types[:2]:  # Limit to 2 additional searches
                    if len(all_places) >= max_results:
                        break
                    
                    search_payload = {
                        "textQuery": f"{place_type} in {request.location}",
                        "maxResultCount": min(20, max_results - len(all_places))
                    }
                    
                    response = await http_client.post(
                        "https://places.googleapis.com/v1/places:searchText",
                        json=search_payload,
                        headers=headers
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        for place in data.get("places", []):
                            # Check if place already exists
                            place_id = place.get("id")
                            if any(p.id == place_id for p in all_places):
                                continue
                            
                            photos = []
                            for photo in place.get("photos", [])[:3]:
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
                                address=place.get("formattedAddress", "Address not available"),
                                latitude=location.get("latitude", 0),
                                longitude=location.get("longitude", 0),
                                website=place.get("websiteUri"),
                                instagram=extract_instagram(place),
                                description=description,
                                photos=photos,
                                rating=place.get("rating"),
                                category=request.category
                            )
                            all_places.append(place_result)
                            
                            if len(all_places) >= max_results:
                                break
        
        # Store search in history
        search_history = {
            "id": str(uuid.uuid4()),
            "category": request.category,
            "location": request.location,
            "results_count": len(all_places),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.search_history.insert_one(search_history)
        
        return SearchResponse(
            success=True,
            places=all_places[:max_results],
            total=len(all_places[:max_results])
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
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "Name",
        "Address",
        "Latitude",
        "Longitude",
        "Website",
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
        writer.writerow([
            place.name,
            place.address,
            place.latitude,
            place.longitude,
            place.website or "",
            place.instagram or "",
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
        {"_id": 0}
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
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
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
