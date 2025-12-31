#!/usr/bin/env python3
"""Script to update license keys with drive_url field in Firestore."""

import json
import urllib.request
import urllib.error

# Firebase configuration
FIREBASE_PROJECT_ID = "claude-log"
FIREBASE_API_KEY = "AIzaSyDf62KkjB4FI001yCqrh0kF_OvqAz-ZND0"
FIRESTORE_BASE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents"

# License keys with drive URLs (managers only, not admin)
LICENSE_DRIVE_URLS = {
    "CCL-4268938B34617E10": "https://drive.google.com/drive/folders/1KsspxL00m8XwiPgNOfgvx69vEPIqKYI7",
    "CCL-58D1AAEADC91C6C7": "https://drive.google.com/drive/folders/1eX7jeqD8gQ6Qo-0yEktOQ9jcEb3UpcFC",
    "CCL-0801BF832E020E39": "https://drive.google.com/drive/folders/1WWvNW5mg_rAvYvYphGlICeIFEPiFnosP",
    "CCL-42A22D6F2C6F56FB": "https://drive.google.com/drive/folders/1mr4UfhpC4cU4FjoDDNu8dh0cG4aAw5De",
    "CCL-DB251FB9E19CBB7A": "https://drive.google.com/drive/folders/1KsspxL00m8XwiPgNOfgvx69vEPIqKYI7",
    "CCL-00653A0BD7DE750D": "https://drive.google.com/drive/folders/1SUZU1Y9ImDvxC7JyuDJ57GCNroZRiSP3",
    "CCL-15FC83AEC641EE53": "https://drive.google.com/drive/folders/1aHQE6G4S1yq-ZCb8f6GOBaTefRn-G0me",
    "CCL-56675048BBB3774A": "https://drive.google.com/drive/folders/1F5XlcoDu3c3DrwdwAPLlBMIONk6jj9Qo",
    "CCL-23AD9742F61B9893": "https://drive.google.com/drive/folders/1bL_nL_ZXVz8XdhQ_VuhQEgc0QpQQf08a",
    "CCL-24572640E1EB9D6E": "https://drive.google.com/drive/folders/1eX7jeqD8gQ6Qo-0yEktOQ9jcEb3UpcFC",
    "CCL-814D1DADF0548AE1": "https://drive.google.com/drive/folders/1mr4UfhpC4cU4FjoDDNu8dh0cG4aAw5De",
    "CCL-A46357C56D508013": "https://drive.google.com/drive/folders/1KsspxL00m8XwiPgNOfgvx69vEPIqKYI7",
}


def update_license_drive_url(key: str, drive_url: str) -> dict:
    """Update a license with drive_url field."""
    # Only update the drive_url field
    document = {
        "fields": {
            "drive_url": {"stringValue": drive_url},
        }
    }

    # Use PATCH with updateMask to only update drive_url field
    url = f"{FIRESTORE_BASE_URL}/licenses/{key}?key={FIREBASE_API_KEY}&updateMask.fieldPaths=drive_url"

    try:
        data = json.dumps(document).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="PATCH",
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
            return {"success": True, "data": result}

    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else str(e)
        return {"success": False, "error": f"HTTP {e.code}: {error_body}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def main():
    """Update all license keys with drive URLs."""
    print("=" * 60)
    print("Updating License Keys with Drive URLs")
    print(f"Project: {FIREBASE_PROJECT_ID}")
    print("=" * 60)
    print()

    success_count = 0
    error_count = 0

    for key, drive_url in LICENSE_DRIVE_URLS.items():
        print(f"Updating: {key}", end=" ... ")

        result = update_license_drive_url(key, drive_url)

        if result["success"]:
            print("✅ OK")
            success_count += 1
        else:
            print(f"❌ Error: {result['error']}")
            error_count += 1

    print()
    print("=" * 60)
    print(f"Results: {success_count} success, {error_count} errors")
    print("=" * 60)


if __name__ == "__main__":
    main()
