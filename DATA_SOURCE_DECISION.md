# Data Source Decision: CSV vs GeoJSON

## Decision: Use CSVs from Addresses/ folder

For a **read-heavy address search frontend**, use the **CSVs in the Addresses/ folder** instead of GeoJSON files.

This decision has been validated by the local Postgres import:

- `27` CSV chunks from `Addresses/` imported successfully.
- `17,169,294` rows loaded into `nar_addresses`.
- A random exact-city lookup for `Burlington, ON` works against the imported dataset.
- Burlington exists in at least two provinces in the data, so city-only queries should allow an optional province filter.

## Rationale

### CSVs are better because:

1. **Faster parsing** - CSVs are simpler and faster to parse than the 4.4GB GeoJSON file
2. **Easier querying** - You can load CSVs into a database (SQLite, PostgreSQL) with proper indexes for fast searches
3. **More complete data** - CSVs have ~29 fields including:
   - `LOC_GUID`, `ADDR_GUID`
   - `CIVIC_NO`, `CIVIC_NO_SUFFIX`
   - `OFFICIAL_STREET_NAME`, `OFFICIAL_STREET_TYPE`, `OFFICIAL_STREET_DIR`
   - `CSD_ENG_NAME` (city), `PROV_CODE`
   - `MAIL_POSTAL_CODE`
   - `BG_X`, `BG_Y` (coordinates)
   - And more...
4. **Smaller chunks** - Multiple CSV files (40-173MB each) are easier to work with than one massive GeoJSON

### GeoJSON drawbacks:

- 4.4GB single file is unwieldy for a frontend
- Heavier to parse (nested JSON structure)
- Some entries have `null` geometry
- Designed for mapping visualizations, not text-based searching
- Limited fields: hash, number, street, unit, city, region, postcode, id

## Recommended Implementation Approach

1. **Import CSVs into a database**
   - Current implementation: PostgreSQL 16
   - PostGIS is not required for the current text-based random address lookup
   - SQLite remains possible for a lighter future distribution, but it is not the active local setup

2. **Create indexes on search fields**
   - `OFFICIAL_STREET_NAME`
   - `CSD_ENG_NAME` (city)
   - `MAIL_POSTAL_CODE`
   - `PROV_CODE`
   - Current implementation indexes `lower(csd_eng_name)`, city plus province abbreviation, postal code, street name, and a trigram city index

3. **Use coordinates for mapping when needed**
   - `BG_X`, `BG_Y` fields contain coordinate data
   - Can convert to lat/lon for map display

4. **Serve results via API endpoint**
   - Build a simple REST or GraphQL API
   - Return paginated results for search queries

## File Structure

```
Addresses/
├── Address_10.csv      (39 MB)
├── Address_11.csv      (16 MB)
├── Address_12.csv      (100 MB)
├── Address_13.csv      (74 MB)
├── Address_24_part_*.csv (multiple files, ~173 MB each)
└── ...

ca/
└── countrywide-addresses-country.geojson (4.4 GB)
```

## Example CSV Row

```csv
LOC_GUID,ADDR_GUID,APT_NO_LABEL,CIVIC_NO,CIVIC_NO_SUFFIX,OFFICIAL_STREET_NAME,OFFICIAL_STREET_TYPE,OFFICIAL_STREET_DIR,PROV_CODE,CSD_ENG_NAME,...
db516aab-92c3-497d-bba0-816df7049906,7ef6145d-efb1-4277-b1f9-821c22ba8234,,43,,Horncastle,DR,,10,Paradise,...
```

## Conclusion

The CSVs provide better performance, more data fields, and easier integration with search tools for a read-heavy workflow. They are now the canonical source for this local retriever.
