#!/usr/bin/env python3
"""Script to add license keys to Firebase Firestore."""

import json
import urllib.request
import urllib.error
from datetime import datetime

# Firebase configuration
FIREBASE_PROJECT_ID = "claude-log"
FIREBASE_API_KEY = "AIzaSyDf62KkjB4FI001yCqrh0kF_OvqAz-ZND0"
FIRESTORE_BASE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents"

# License keys to add (excluding already added keys)
LICENSE_KEYS = [
    {"key": "CCL-58D1AAEADC91C6C7", "email": "user2@email.com", "is_admin": False},
    {"key": "CCL-42A22D6F2C6F56FB", "email": "user4@email.com", "is_admin": False},
    {"key": "CCL-DB251FB9E19CBB7A", "email": "user5@email.com", "is_admin": False},
    {"key": "CCL-56675048BBB3774A", "email": "user8@email.com", "is_admin": False},
    {"key": "CCL-814D1DADF0548AE1", "email": "user11@email.com", "is_admin": False},
    {"key": "CCL-A46357C56D508013", "email": "user12@email.com", "is_admin": False},
]


def add_license_to_firestore(license_data: dict) -> dict:
    """Add a single license to Firestore.

    Args:
        license_data: Dict with 'key', 'email', 'is_admin'

    Returns:
        Result dict with 'success' and 'error' or 'data'
    """
    key = license_data["key"]
    email = license_data["email"]
    is_admin = license_data.get("is_admin", False)

    # Firestore document structure
    document = {
        "fields": {
            "active": {"booleanValue": True},
            "email": {"stringValue": email},
            "is_admin": {"booleanValue": is_admin},
            "created": {"timestampValue": datetime.utcnow().isoformat() + "Z"},
        }
    }

    # URL to create/update document
    # Using PATCH with updateMask to create or update
    url = f"{FIRESTORE_BASE_URL}/licenses/{key}?key={FIREBASE_API_KEY}"

    try:
        data = json.dumps(document).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="PATCH",  # PATCH creates if not exists
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
    """Add all license keys to Firestore."""
    print("=" * 60)
    print("Adding License Keys to Firebase Firestore")
    print(f"Project: {FIREBASE_PROJECT_ID}")
    print("=" * 60)
    print()

    success_count = 0
    error_count = 0

    for license_data in LICENSE_KEYS:
        key = license_data["key"]
        is_admin = license_data.get("is_admin", False)

        print(f"Adding: {key}", end=" ")
        if is_admin:
            print("(ADMIN)", end=" ")
        print("...", end=" ")

        result = add_license_to_firestore(license_data)

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

    if error_count == 0:
        print()
        print("🎉 All licenses added successfully!")
        print()
        print("You can view them at:")
        print(
            f"https://console.firebase.google.com/project/{FIREBASE_PROJECT_ID}/firestore/data/~2Flicenses"
        )


if __name__ == "__main__":
    main()
