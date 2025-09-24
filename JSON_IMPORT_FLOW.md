# LoRA JSON Import Data Flow

## Overview
This document illustrates the complete data flow from Civitai JSON files to database storage in the LoRA Manager system.

## Visual Data Flow

```mermaid
graph TD
    A[Directory with LoRA Files] -->|Scan| B[JSON Discovery]
    A -->|Find| C[Model File Discovery]
    
    B --> D[JSON File]
    C --> E[.safetensors/.pt/.bin/.ckpt]
    
    D -->|Parse| F[parse_civitai_json()]
    F --> G[ParsedMetadata Object]
    
    G --> H[Field Extraction]
    
    H --> I[Core Fields]
    H --> J[Version Info]  
    H --> K[File Info]
    H --> L[Creator Info]
    H --> M[Stats & Metadata]
    H --> N[Unmapped Fields]
    
    I --> O[name, description, tags]
    J --> P[version, published_at, trained_words]
    K --> Q[file_name, size, hash, download_url]
    L --> R[author_username]
    M --> S[stats, nsfw_level, activation_text]
    N --> T[extra JSON object]
    
    O --> U[AdapterCreate Schema]
    P --> U
    Q --> U
    R --> U
    S --> U
    T --> U
    
    E -->|Validate| V[File Path Validation]
    V -->|✓ Exists| U
    V -->|✗ Missing| W[Import Error]
    
    U --> X[register_adapter_from_metadata()]
    X -->|Check| Y[needs_resync()?]
    
    Y -->|Yes| Z[Database Upsert]
    Y -->|No| AA[Skip - Already Current]
    
    Z --> AB[AdapterService.upsert_adapter()]
    AB --> AC[Database Transaction]
    
    AC --> AD[Insert/Update adapter Table]
    AD --> AE[Update Import Tracking]
    AE --> AF[Success Response]
    
    AC -->|Error| AG[Rollback & Error Response]
```

## Detailed Process Steps

### 1. File Discovery Phase
```
discover_metadata(import_path) 
├── Recursively walk directory tree
├── Find all *.json files
├── Apply ignore patterns
└── Yield JSON file paths

discover_orphan_safetensors(import_path)
├── Find *.safetensors without matching JSON
├── Report orphaned model files
└── Return list for manual review
```

### 2. JSON Parsing Phase
**Input**: Civitai JSON file
```json
{
  "name": "Celestial Anime Portraits",
  "description": "Create luminous anime-inspired character portraits...",
  "tags": ["anime", "portrait", "fantasy", "celestial", "watercolor"],
  "creator": { "username": "stargazer" },
  "modelVersions": [{
    "name": "v1.1",
    "publishedAt": "2024-05-01T12:00:00Z",
    "trainedWords": ["celestial portrait", "shimmering eyes"],
    "files": [{
      "name": "celestial-anime-portraits.safetensors",
      "downloadUrl": "http://example.com/model.safetensors",
      "hashes": { "SHA256": "abc123" },
      "sizeKB": 155000,
      "primary": true
    }]
  }],
  "stats": {
    "downloadCount": 4200,
    "favoriteCount": 380,
    "rating": 4.6
  },
  "supportsGeneration": true,
  "sd version": "SD1.5",
  "nsfwLevel": 0,
  "activation text": "celestial portrait"
}
```

**Processing Logic**:
```python
def parse_civitai_json(json_path: str) -> ParsedMetadata:
    # Load and validate JSON
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Extract core fields
    name = data.get("name") or os.path.splitext(os.path.basename(json_path))[0]
    description = data.get("description")
    tags = data.get("tags", [])
    
    # Process modelVersions array
    model_versions = data.get("modelVersions", [])
    if model_versions:
        first_version = model_versions[0]
        version = first_version.get("name") or data.get("version")
        published_at = first_version.get("publishedAt")
        trained_words = first_version.get("trainedWords", [])
        
        # Extract primary file info
        files = first_version.get("files", [])
        primary_file = find_primary_file(files)  # Primary=true or largest
        
    # Extract creator info
    creator = data.get("creator", {})
    author_username = creator.get("username")
    
    # Handle metadata fields
    supports_generation = data.get("supportsGeneration", False)
    sd_version = data.get("sd version")
    nsfw_level = data.get("nsfwLevel", 0)
    activation_text = data.get("activation text")
    stats = data.get("stats")
    
    # Discover model file path
    file_path = discover_model_file(json_path, primary_file_name)
    
    # Collect unmapped fields
    mapped_keys = {"name", "version", "description", "creator", "tags", ...}
    extra = {k: v for k, v in data.items() if k not in mapped_keys}
    
    return ParsedMetadata(...)
```

### 3. Model File Discovery
```python
def discover_model_file(json_path, primary_file_name):
    base = os.path.splitext(json_path)[0]
    
    # Try exact filename from JSON
    if primary_file_name:
        candidate = os.path.join(os.path.dirname(json_path), primary_file_name)
        if os.path.exists(candidate):
            return candidate
    
    # Try same basename with known extensions
    for ext in (".safetensors", ".pt", ".bin", ".ckpt"):
        candidate = base + ext
        if os.path.exists(candidate):
            return candidate
    
    # Default assumption
    return base + ".safetensors"
```

### 4. Database Mapping
**ParsedMetadata → AdapterCreate Schema**:
```python
payload = {
    # Core identification
    "name": parsed.name,
    "version": parsed.version,
    "file_path": parsed.file_path,
    
    # Metadata from extra object
    "description": extra_data.get("description"),
    "author_username": extra_data.get("author_username"),
    "published_at": extra_data.get("published_at"),
    "visibility": "Public",  # default
    
    # Arrays
    "tags": parsed.tags,
    "trained_words": extra_data.get("trained_words", []),
    "triggers": [],  # derived from trained_words
    
    # File information
    "primary_file_name": extra_data.get("primary_file_name"),
    "primary_file_size_kb": extra_data.get("primary_file_size_kb"),
    "primary_file_sha256": extra_data.get("primary_file_sha256"),
    "primary_file_download_url": extra_data.get("primary_file_download_url"),
    
    # Generation settings
    "weight": parsed.weight or 1.0,
    "supports_generation": extra_data.get("supports_generation", False),
    "sd_version": extra_data.get("sd_version"),
    "nsfw_level": extra_data.get("nsfw_level", 0),
    "activation_text": extra_data.get("activation_text"),
    
    # Usage state
    "active": False,  # default
    "ordinal": None,
    "archetype": None,
    "archetype_confidence": None,
    
    # Metadata
    "stats": extra_data.get("stats"),
    "extra": extra_data.get("unmapped"),  # unmapped JSON fields
    
    # Import tracking
    "json_file_path": json_path,
    "json_file_mtime": file_modification_time,
    "json_file_size": file_size_bytes,
    "last_ingested_at": datetime.now(timezone.utc),
}
```

### 5. Database Storage
**Final Database Record**:
```sql
INSERT INTO adapter (
    id, name, version, canonical_version_name,
    description, author_username, visibility, published_at,
    tags, trained_words, triggers,
    file_path, weight, active, ordinal,
    archetype, archetype_confidence,
    primary_file_name, primary_file_size_kb, primary_file_sha256,
    primary_file_download_url, primary_file_local_path,
    supports_generation, sd_version, nsfw_level, activation_text,
    stats, extra,
    json_file_path, json_file_mtime, json_file_size, last_ingested_at,
    created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
    $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
    $29, $30, $31, $32, $33, $34
)
ON CONFLICT (name, version) DO UPDATE SET
    -- Update all fields with new values
    description = EXCLUDED.description,
    author_username = EXCLUDED.author_username,
    -- ... all other fields
    last_ingested_at = EXCLUDED.last_ingested_at,
    updated_at = EXCLUDED.updated_at;
```

## Change Detection Logic

```python
def needs_resync(json_path: str, force_resync: bool = False) -> bool:
    if force_resync:
        return True
    
    # Check if file exists
    if not os.path.exists(json_path):
        return False
    
    # Query existing record
    statement = select(Adapter).where(Adapter.json_file_path == json_path)
    existing = session.exec(statement).first()
    
    if not existing or not existing.json_file_mtime:
        return True  # New file or no tracking data
    
    # Compare modification times
    file_mtime = datetime.fromtimestamp(os.stat(json_path).st_mtime, tz=timezone.utc)
    existing_mtime = existing.json_file_mtime
    
    return file_mtime > existing_mtime
```

## Error Handling & Validation

### File Validation
- **Model File Existence**: Verify model file exists before database insertion
- **Path Security**: Validate file paths are within expected directories
- **File Format**: Check file extensions match expected types
- **Size Validation**: Reasonable file size bounds

### Data Validation
- **JSON Schema**: Validate incoming JSON structure
- **Field Types**: Pydantic schema validation for all fields
- **Required Fields**: Ensure minimum required data is present
- **Unique Constraints**: Handle duplicate name/version combinations

### Error Recovery
- **Transaction Rollback**: Database changes rolled back on errors
- **Partial Import**: Continue processing other files if one fails
- **Error Logging**: Comprehensive error tracking and reporting
- **Retry Logic**: Configurable retry for transient failures

## Performance Optimizations

### Batch Processing
- **Bulk Inserts**: Process multiple files in batches
- **Connection Pooling**: Efficient database connection management
- **Parallel Processing**: Multi-threaded file processing (future enhancement)

### Caching
- **File System Cache**: Avoid redundant file system operations
- **Metadata Cache**: Cache parsed JSON for duplicate processing
- **Database Query Cache**: Optimize existence checks

### Incremental Updates
- **Change Detection**: Only process modified files
- **Timestamp Tracking**: Efficient modification time comparisons
- **Selective Updates**: Update only changed fields

## Monitoring & Observability

### Import Metrics
- **Files Processed**: Count of JSON files processed
- **Success Rate**: Percentage of successful imports
- **Processing Time**: Duration metrics per file and batch
- **Error Classification**: Categorized error reporting

### Data Quality Metrics
- **Coverage**: Percentage of fields populated from JSON
- **Validation Failures**: Count and types of validation errors
- **Orphaned Files**: Model files without metadata
- **Duplicate Detection**: Handling of duplicate imports

This comprehensive data flow ensures robust, reliable, and efficient import of LoRA metadata from Civitai JSON files into the LoRA Manager database while maintaining data integrity and providing excellent observability.