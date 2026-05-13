"""Document requirement rules engine.

Maps zones and overlays to required documents based on document_rules.json
"""

import json
from pathlib import Path


def load_rules() -> dict:
    """Load document rules from shared package."""
    rules_path = Path(__file__).parent.parent.parent.parent / "shared" / "document_rules.json"
    with open(rules_path) as f:
        return json.load(f)


def get_required_documents(
    zone_code: str | None,
    overlays: dict[str, bool],
) -> list[dict]:
    """
    Determine required documents based on zone and overlay presence.
    
    Args:
        zone_code: Zone code (e.g., "RB", "RMD", "CHB")
        overlays: Dict mapping overlay names to boolean presence
    
    Returns:
        List of required documents with type, category, reason, and triggers
    """
    rules = load_rules()
    required_docs = {}  # Use dict to deduplicate by document type
    
    # Start with baseline documents (always required)
    for doc in rules.get("baseline_documents", []):
        doc_type = doc["document_type"]
        required_docs[doc_type] = {
            "document_type": doc_type,
            "category": doc["category"],
            "reason": doc["reason"],
            "triggered_by": ["Baseline (RMA Schedule 4)"],
        }
    
    # Add zone-based requirements
    if zone_code:
        zone_reqs = rules.get("zone_based_requirements", {}).get(zone_code, {})
        for doc in zone_reqs.get("documents", []):
            doc_type = doc["document_type"]
            if doc_type not in required_docs:
                required_docs[doc_type] = {
                    "document_type": doc_type,
                    "category": doc["category"],
                    "reason": doc["reason"],
                    "triggered_by": [f"Zone: {zone_code}"],
                }
            else:
                # Append trigger if not already present
                if f"Zone: {zone_code}" not in required_docs[doc_type]["triggered_by"]:
                    required_docs[doc_type]["triggered_by"].append(f"Zone: {zone_code}")
    
    # Add overlay-based requirements
    overlay_reqs = rules.get("overlay_based_requirements", {})
    for overlay_name, is_present in overlays.items():
        if is_present and overlay_name in overlay_reqs:
            overlay_info = overlay_reqs[overlay_name]
            for doc in overlay_info.get("documents", []):
                doc_type = doc["document_type"]
                trigger = f"Overlay: {overlay_info['overlay_name']}"
                
                if doc_type not in required_docs:
                    required_docs[doc_type] = {
                        "document_type": doc_type,
                        "category": doc["category"],
                        "reason": doc["reason"],
                        "triggered_by": [trigger],
                    }
                else:
                    # Append trigger if not already present
                    if trigger not in required_docs[doc_type]["triggered_by"]:
                        required_docs[doc_type]["triggered_by"].append(trigger)
    
    # Convert to list and sort by category
    return sorted(
        required_docs.values(),
        key=lambda x: (x["category"], x["document_type"]),
    )
