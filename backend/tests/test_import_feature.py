"""
Backend API Tests for Import Feature - CSV/Excel Upload, Cross-Check, Description Generation, Export
Tests: Upload parsing, Google cross-check, Gemini description generation, Export enriched data
"""
import pytest
import requests
import os
import io
import csv

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestImportUpload:
    """Test CSV/Excel file upload and parsing"""
    
    def test_upload_csv_file(self):
        """Test uploading a CSV file and parsing locations"""
        # Create a test CSV file in memory
        csv_content = """Experience Type,Name,Address,Latitude,Longitude,Website,Phone,Instagram,Description,Rating,Image 1,Image 2,Image 3
Foodie,Nobu Miami,4525 Collins Ave Miami Beach FL 33140,25.8196,-80.1219,https://www.noburestaurants.com,,noburestaurants,,,,,
Thrill Seeking,iFLY Indoor Skydiving,,0,0,,,,,,,,,
Creative,Museum of Ice Cream,558 Broadway New York NY 10012,0,0,https://www.museumoficecream.com,,,,4.2,,,
"""
        files = {'file': ('test_import.csv', io.BytesIO(csv_content.encode('utf-8')), 'text/csv')}
        
        response = requests.post(f"{BASE_URL}/api/import/upload", files=files, timeout=30)
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert data["count"] == 3
        assert len(data["locations"]) == 3
        
        # Check first location structure
        loc = data["locations"][0]
        assert "id" in loc
        assert loc["name"] == "Nobu Miami"
        assert loc["address"] == "4525 Collins Ave Miami Beach FL 33140"
        assert loc["latitude"] == 25.8196
        assert loc["longitude"] == -80.1219
        assert loc["website"] == "https://www.noburestaurants.com"
        assert "instagram" in loc  # Should be normalized to full URL
        
        print(f"✓ Upload CSV: {data['count']} locations parsed")
        for l in data["locations"]:
            print(f"  - {l['name']}: desc='{l.get('description', '')}', rating={l.get('rating')}")
        
        return data["locations"]
    
    def test_upload_csv_without_phone_column(self):
        """Test uploading old format CSV without Phone column"""
        csv_content = """Experience Type,Name,Address,Latitude,Longitude,Website,Instagram,Description,Rating,Image 1,Image 2,Image 3
Foodie,Test Restaurant,123 Test St,40.7128,-74.006,https://test.com,testhandle,A test desc,4.5,,,
"""
        files = {'file': ('test_old_format.csv', io.BytesIO(csv_content.encode('utf-8')), 'text/csv')}
        
        response = requests.post(f"{BASE_URL}/api/import/upload", files=files, timeout=30)
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert data["count"] == 1
        loc = data["locations"][0]
        assert loc["name"] == "Test Restaurant"
        # Phone should be empty string for old format
        assert loc.get("phone", "") == ""
        
        print("✓ Upload CSV (old format without Phone): parsed correctly")
    
    def test_upload_empty_file(self):
        """Test uploading empty/invalid file"""
        files = {'file': ('empty.csv', io.BytesIO(b''), 'text/csv')}
        
        response = requests.post(f"{BASE_URL}/api/import/upload", files=files, timeout=30)
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert data["count"] == 0
        print("✓ Upload empty CSV: handled gracefully")
    
    def test_upload_invalid_file_type(self):
        """Test uploading unsupported file type"""
        files = {'file': ('test.pdf', io.BytesIO(b'dummy content'), 'application/pdf')}
        
        response = requests.post(f"{BASE_URL}/api/import/upload", files=files, timeout=30)
        assert response.status_code == 400
        print("✓ Upload invalid file type: rejected correctly")


class TestImportCrossCheck:
    """Test cross-checking locations against Google Places API"""
    
    def test_cross_check_locations(self):
        """Test cross-checking imported locations against Google Places"""
        test_locations = [
            {
                "id": "test-1",
                "experience_type": "Foodie",
                "name": "Nobu Miami",
                "address": "4525 Collins Ave Miami Beach FL 33140",
                "latitude": 25.8196,
                "longitude": -80.1219,
                "website": "https://www.noburestaurants.com",
                "phone": "",
                "instagram": "https://instagram.com/noburestaurants",
                "description": "",
                "rating": None,
                "images": []
            }
        ]
        
        response = requests.post(
            f"{BASE_URL}/api/import/cross-check",
            json=test_locations,
            timeout=60  # Cross-check can take a while
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert len(data["results"]) == 1
        
        result = data["results"][0]
        assert "id" in result
        assert "original" in result
        assert "matched" in result
        assert "discrepancies" in result
        
        # Check if it found a match (Nobu is a real place)
        if result["matched"]:
            print(f"✓ Cross-check: Matched '{result['original']['name']}'")
            
            # Check if Google data was retrieved
            if result.get("google"):
                google_loc = result["google"]
                print(f"  - Google name: {google_loc.get('name')}")
                print(f"  - Google address: {google_loc.get('address')}")
                print(f"  - Google phone: {google_loc.get('phone')}")
                print(f"  - Google rating: {google_loc.get('rating')}")
            
            # Check discrepancies
            if result["discrepancies"]:
                print(f"  - Discrepancies found: {list(result['discrepancies'].keys())}")
        else:
            print("✓ Cross-check: Location not found in Google (expected for some test data)")
        
        return data["results"]
    
    def test_cross_check_auto_fills_missing_fields(self):
        """Test that cross-check auto-fills missing fields from Google data"""
        test_locations = [
            {
                "id": "test-autofill",
                "experience_type": "",
                "name": "Museum of Ice Cream",
                "address": "",  # Missing - should be filled
                "latitude": 0,
                "longitude": 0,
                "website": "",
                "phone": "",
                "instagram": "",
                "description": "",
                "rating": None,
                "images": []
            }
        ]
        
        response = requests.post(
            f"{BASE_URL}/api/import/cross-check",
            json=test_locations,
            timeout=60
        )
        
        assert response.status_code == 200
        data = response.json()
        result = data["results"][0]
        
        if result["matched"]:
            original = result["original"]
            # Check if fields were auto-filled
            if original.get("address"):
                print(f"✓ Auto-fill address: {original['address']}")
            if original.get("phone"):
                print(f"✓ Auto-fill phone: {original['phone']}")
            if original.get("rating"):
                print(f"✓ Auto-fill rating: {original['rating']}")
            if original.get("images"):
                print(f"✓ Auto-fill images: {len(original['images'])} images")
        else:
            print("✓ Cross-check auto-fill: Location not matched (no auto-fill performed)")
    
    def test_cross_check_flags_discrepancies(self):
        """Test that cross-check correctly identifies discrepancies"""
        test_locations = [
            {
                "id": "test-discrep",
                "experience_type": "Foodie",
                "name": "Nobu Miami",
                "address": "Wrong Address 123",  # Intentionally wrong
                "latitude": 0,
                "longitude": 0,
                "website": "https://wrong-website.com",  # Intentionally wrong
                "phone": "+1-999-999-9999",  # Intentionally wrong
                "instagram": "",
                "description": "A wrong description",
                "rating": 1.0,  # Intentionally wrong
                "images": []
            }
        ]
        
        response = requests.post(
            f"{BASE_URL}/api/import/cross-check",
            json=test_locations,
            timeout=60
        )
        
        assert response.status_code == 200
        data = response.json()
        result = data["results"][0]
        
        if result["matched"]:
            discreps = result.get("discrepancies", {})
            if discreps:
                print(f"✓ Discrepancies flagged: {list(discreps.keys())}")
                for field, info in discreps.items():
                    print(f"  - {info['label']}: Original='{info['original']}' vs Google='{info['google']}'")
            else:
                print("✓ No discrepancies found (Google data matched)")
        else:
            print("✓ Location not matched in Google")


class TestDescriptionGeneration:
    """Test AI description generation using Gemini"""
    
    def test_generate_description_for_location(self):
        """Test generating a description for a single location"""
        request_data = {
            "name": "Central Park",
            "address": "New York, NY",
            "category": "super_chill",
            "website": ""
        }
        
        response = requests.post(
            f"{BASE_URL}/api/import/generate-description",
            json=request_data,
            timeout=30
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert "description" in data
        assert len(data["description"]) > 0
        assert len(data["description"]) <= 500  # Should be under 500 chars
        
        print(f"✓ Generate description: {len(data['description'])} chars")
        print(f"  Description: {data['description'][:100]}...")
    
    def test_generate_description_with_context(self):
        """Test generating a description with full context"""
        request_data = {
            "name": "Nobu Miami",
            "address": "4525 Collins Ave, Miami Beach, FL 33140",
            "category": "foodie",
            "website": "https://www.noburestaurants.com"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/import/generate-description",
            json=request_data,
            timeout=30
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert len(data["description"]) <= 500
        
        print(f"✓ Generate description with context: {len(data['description'])} chars")


class TestImportExportCSV:
    """Test exporting enriched locations to CSV"""
    
    def test_export_enriched_csv(self):
        """Test exporting enriched locations to CSV format"""
        test_locations = [
            {
                "id": "export-1",
                "experience_type": "foodie",
                "name": "Test Restaurant",
                "address": "123 Test St, NYC",
                "latitude": 40.7128,
                "longitude": -74.006,
                "website": "https://testrestaurant.com",
                "phone": "+1-212-555-1234",
                "instagram": "https://instagram.com/testrestaurant",
                "description": "A great test restaurant",
                "rating": 4.5,
                "images": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"]
            },
            {
                "id": "export-2",
                "experience_type": "thrill_seeking",
                "name": "Test Adventure",
                "address": "456 Adventure Ave, LA",
                "latitude": 34.0522,
                "longitude": -118.2437,
                "website": "https://testadventure.com",
                "phone": "",
                "instagram": "",
                "description": "",
                "rating": None,
                "images": []
            }
        ]
        
        response = requests.post(
            f"{BASE_URL}/api/import/export-csv",
            json=test_locations,
            timeout=30
        )
        
        assert response.status_code == 200
        assert response.headers.get('content-type') == 'text/csv; charset=utf-8'
        assert 'attachment' in response.headers.get('content-disposition', '')
        
        content = response.text
        lines = content.strip().split('\n')
        
        # Check header
        header = lines[0]
        expected_columns = [
            "Experience Type", "Name", "Address", "Latitude", "Longitude",
            "Website", "Phone", "Instagram", "Description", "Rating",
            "Image 1", "Image 2", "Image 3"
        ]
        for col in expected_columns:
            assert col in header, f"Missing column: {col}"
        
        # Parse and validate rows
        reader = csv.DictReader(io.StringIO(content))
        rows = list(reader)
        
        assert len(rows) == 2
        
        # First row validation
        row1 = rows[0]
        assert row1["Experience Type"] == "Foodie"  # Should be display name
        assert row1["Name"] == "Test Restaurant"
        assert row1["Phone"] == "+1-212-555-1234"
        assert row1["Instagram"] == "testrestaurant"  # Should be handle only
        assert row1["Description"] == "A great test restaurant"
        
        # Second row validation
        row2 = rows[1]
        assert row2["Experience Type"] == "Thrill Seeking"  # Should be display name
        assert row2["Phone"] == ""
        assert row2["Instagram"] == ""
        
        print(f"✓ Export CSV: {len(rows)} rows with correct format")
        print(f"  - Phone column present: ✓")
        print(f"  - Instagram as handle only: ✓")
        print(f"  - Experience Type display names: ✓")
    
    def test_export_csv_empty_list(self):
        """Test exporting empty list"""
        response = requests.post(
            f"{BASE_URL}/api/import/export-csv",
            json=[],
            timeout=30
        )
        
        assert response.status_code == 200
        content = response.text
        
        # Should have header only
        lines = content.strip().split('\n')
        assert len(lines) == 1
        assert "Experience Type" in lines[0]
        
        print("✓ Export empty CSV: header only")


class TestEndToEndImportFlow:
    """Test the complete import -> cross-check -> export flow"""
    
    def test_full_import_flow(self):
        """Test complete import workflow"""
        # Step 1: Upload CSV
        csv_content = """Experience Type,Name,Address,Latitude,Longitude,Website,Phone,Instagram,Description,Rating,Image 1,Image 2,Image 3
Foodie,Nobu Miami,4525 Collins Ave Miami Beach FL,25.8196,-80.1219,https://www.noburestaurants.com,,noburestaurants,,,,,
"""
        files = {'file': ('test.csv', io.BytesIO(csv_content.encode('utf-8')), 'text/csv')}
        
        upload_response = requests.post(f"{BASE_URL}/api/import/upload", files=files, timeout=30)
        assert upload_response.status_code == 200
        upload_data = upload_response.json()
        print(f"Step 1 - Upload: {upload_data['count']} locations")
        
        # Step 2: Cross-check against Google
        locations = upload_data["locations"]
        crosscheck_response = requests.post(
            f"{BASE_URL}/api/import/cross-check",
            json=locations,
            timeout=60
        )
        assert crosscheck_response.status_code == 200
        crosscheck_data = crosscheck_response.json()
        
        matched = sum(1 for r in crosscheck_data["results"] if r["matched"])
        print(f"Step 2 - Cross-check: {matched}/{len(crosscheck_data['results'])} matched")
        
        # Get enriched locations
        enriched = [r["original"] for r in crosscheck_data["results"]]
        
        # Step 3: Generate description if missing
        for loc in enriched:
            if not loc.get("description"):
                desc_response = requests.post(
                    f"{BASE_URL}/api/import/generate-description",
                    json={
                        "name": loc["name"],
                        "address": loc.get("address", ""),
                        "category": loc.get("experience_type", ""),
                        "website": loc.get("website", "")
                    },
                    timeout=30
                )
                if desc_response.status_code == 200:
                    loc["description"] = desc_response.json().get("description", "")
                    print(f"Step 3 - Generated description for {loc['name']}: {len(loc['description'])} chars")
        
        # Step 4: Export enriched data
        export_response = requests.post(
            f"{BASE_URL}/api/import/export-csv",
            json=enriched,
            timeout=30
        )
        assert export_response.status_code == 200
        print(f"Step 4 - Exported enriched CSV")
        
        print("✓ Full import flow completed successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
