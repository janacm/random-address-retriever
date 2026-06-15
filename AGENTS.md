# National Address Register (NAR) - Developer Reference

**Version:** July 18, 2025  
**Catalogue No:** 46-26-0002  
**ISBN:** 978-0-660-77708-5  
**Source:** Statistics Canada

---

## Table of Contents

1. [Overview](#overview)
2. [Data Model](#data-model)
   - [Location vs Address Concept](#location-vs-address-concept)
   - [Entity Relationships](#entity-relationships)
3. [Field Reference](#field-reference)
4. [Reference Code Tables](#reference-code-tables)
   - [Building Usage Codes](#building-usage-codes)
   - [Province Codes](#province-codes)
5. [Technical Specifications](#technical-specifications)
   - [GUID Format](#guid-format)
   - [Coordinate Systems](#coordinate-systems)
   - [Dominion Land Survey (DLS)](#dominion-land-survey-dls)
6. [Practical Examples](#practical-examples)
   - [JSON Examples](#json-examples)
   - [SQL DDL](#sql-ddl)
   - [Sample Queries](#sample-queries)
7. [Additional Resources](#additional-resources)
8. [Contact Information](#contact-information)

---

## Overview

### Purpose

The National Address Register (NAR) provides a standardized address structure and a comprehensive list of valid georeferenced civic addresses across Canada. 

### Key Characteristics

- **Source:** Addresses extracted from Statistics Canada's Building Register
- **Validation:** Validated by two independent data sources
- **Privacy:** Non-confidential - does not disclose identity of residents or businesses
- **Mailing Compliance:** Follows Canada Post's addressing guidelines
- **Coverage:** Civic addresses with optional non-civic address, additional delivery, and building usage information
- **Licensing:** Available for free under Statistics Canada Open Licence; contains information licensed under Open Government Licence – Yukon

### Development Context

Developed as a prototype within the Data Strategy Roadmap for the Federal Public Service, in collaboration with Employment and Social Development Canada to establish address reference data as a service.

### Data Content

- Standardized civic address structure
- Corresponding mailing addresses
- Geographic coordinates (latitude/longitude and projected coordinates)
- Census geography linkages (CSD, CD, ER, FED)
- Building usage classification
- Additional delivery information where available

---

## Data Model

### Location vs Address Concept

**Critical Distinction:** The NAR differentiates between **Location** and **Address** as separate entities with specific relationships.

#### Location (locationId)

- **Definition:** References a specific place or position
- **In NAR Context:** Synonymous with a physical building
- **Identifier:** `LOC_GUID` (locationId)
- **Characteristics:** One per physical structure

#### Address (addressId)

- **Definition:** The particulars of the location where someone lives or an organization is situated
- **In NAR Context:** Corresponds to "building units"
- **Identifier:** `ADDR_GUID` (addressId)
- **Characteristics:** One or more per location

### Entity Relationships

#### Relationship Types

1. **One-to-One (1:1):** Single dwelling homes
   - One location → One address
   - Example: Detached house with single unit

2. **One-to-Many (1:n):** Multi-unit buildings
   - One location → Multiple addresses
   - Example: Apartment building, office building with suites
   - Each building unit differentiated by apartment/suite number

#### Relationship Examples

**Example 1: Single Home (1:1 Relationship)**
```
Address: 1 MAIN ST, TORONTO, ON M1M1A1
locationId: 12345678-1234-1234-1234-123456789abc
addressId: 12345678-1234-1234-1234-123456789Bbc
```

**Example 2: Office Building (1:n Relationship)**
```
Building: 123 MAIN ST, TORONTO, ON M2M1A1
locationId: 22345678-1234-1234-1234-123456789abc (shared)

Unit 1: 2-123 MAIN ST, TORONTO, ON M2M1A1
addressId: 22345678-1234-1234-1234-123456789Zbc

Unit 2: 4-123 MAIN ST, TORONTO, ON M2M1A1
addressId: 22345678-1234-1234-1234-123456789Ybc

Unit 3: 5-123 MAIN ST, TORONTO, ON M2M1A1
addressId: 22345678-1234-1234-1234-123456789Xbc

Unit 4: 8-123 MAIN ST, TORONTO, ON M2M1A1
addressId: 22345678-1234-1234-1234-123456789Rbc
```

**Example 3: Complete Address with All Attributes**
```
12-123 A MAIN ST N, OTTAWA, ON A0A 0A0

Components:
- APT_NO_LABEL: 12
- CIVIC_NO: 123
- CIVIC_NO_SUFFIX: A
- OFFICIAL_STREET_NAME: MAIN
- OFFICIAL_STREET_TYPE: ST
- OFFICIAL_STREET_DIR: N
```

---

## Field Reference

### Complete Attribute List

| Attribute | Description | Data Type | Notes |
|-----------|-------------|-----------|-------|
| **LOC_GUID** | Globally unique identifier for location | STRING(36) | GUID format, references physical building |
| **ADDR_GUID** | Globally unique identifier for address | STRING(36) | GUID format, references building unit |
| **APT_NO_LABEL** | Apartment or suite number | STRING | Unit/suite identifier |
| **CIVIC_NO** | Civic number | STRING | Primary street number |
| **CIVIC_NO_SUFFIX** | Civic number suffix | STRING | Optional suffix (e.g., "A", "B") |
| **OFFICIAL_STREET_NAME** | Official street name | STRING | Standardized name |
| **OFFICIAL_STREET_TYPE** | Official street designator | STRING | E.g., ST, AVE, RD |
| **OFFICIAL_STREET_DIR** | Official street direction | STRING | E.g., N, S, E, W, NE, SW |
| **PROV_CODE** | Province code | STRING(2) | 2-digit code (see Province Codes table) |
| **CSD_CODE** | Census subdivision code (2025) | STRING | 7-digit geographic code |
| **CSD_TYPE_ENG_CODE** | Census subdivision type code English | STRING | CSD classification |
| **CSD_TYPE_FRE_CODE** | Census subdivision type code French | STRING | CSD classification (French) |
| **CSD_ENG_NAME** | Census subdivision English name | STRING | Municipality name |
| **CSD_FRE_NAME** | Census subdivision French name | STRING | Municipality name (French) |
| **ER_CODE** | Economic region code (2021) | STRING | Geographic code |
| **ER_ENG_NAME** | Economic region English name | STRING | Region name |
| **ER_FRE_NAME** | Economic region French name | STRING | Region name (French) |
| **FED_CODE** | Federal electoral district code (2023) | STRING | Based on 2023 Representation Order |
| **FED_ENG_NAME** | Federal electoral district English name | STRING | Electoral district name |
| **FED_FRE_NAME** | Federal electoral district French name | STRING | Electoral district name (French) |
| **MAIL_STREET_NAME** | Mailing street name | STRING | Canada Post format |
| **MAIL_STREET_TYPE** | Mailing street designator | STRING | Canada Post format |
| **MAIL_STREET_DIR** | Mailing street direction | STRING | Canada Post format |
| **MAIL_MUN_NAME** | Mailing municipality name | STRING | Canada Post format |
| **MAIL_PROV_ABVN** | Mailing province abbreviation | STRING(2) | 2-letter abbreviation |
| **MAIL_POSTAL_CODE** | Mailing postal code | STRING | Canadian postal code format |
| **BG_DLS_LSD** | Dominion Land Survey - Legal Subdivision | STRING | Western Canada surveying system |
| **BG_DLS_QTR** | Dominion Land Survey - Quarter | STRING | DLS coordinate component |
| **BG_DLS_SCTN** | Dominion Land Survey - Section | STRING | DLS coordinate component |
| **BG_DLS_TWNSHP** | Dominion Land Survey - Township | STRING | DLS coordinate component |
| **BG_DLS_RNG** | Dominion Land Survey - Range | STRING | DLS coordinate component |
| **BG_DLS_MRD** | Dominion Land Survey - Meridian | STRING | DLS coordinate component |
| **BG_LATITUDE** | Latitude coordinate of building | DECIMAL | EPSG:4326 (WGS84) |
| **BG_LONGITUDE** | Longitude coordinate of building | DECIMAL | EPSG:4326 (WGS84) |
| **BG_X** | Spatial X coordinate of building | DECIMAL | EPSG:3347 (Statistics Canada Lambert) |
| **BG_Y** | Spatial Y coordinate of building | DECIMAL | EPSG:3347 (Statistics Canada Lambert) |
| **BU_USE** | Building usage codes | STRING | See Building Usage Codes table |
| **BU_N_CIVIC_ADD** | Additional delivery information | STRING | E.g., "PO Box 432", "RR2 Site19 Box42" |

### Field Notes

#### Coordinates
- Represent **representative points** associated with buildings
- Intended for geospatial reference
- **May not correspond exactly** to physical center of building structure
- Can represent road access point or driveway entrance

#### Mailing vs Official
- **Official fields:** Standardized governmental address format
- **Mail fields:** Canada Post addressing format (may differ from official)

---

## Reference Code Tables

### Building Usage Codes

| Code | Description (English) | Description (Français) |
|------|----------------------|------------------------|
| 1 | Residential | Résidentiel |
| 2 | Partial Residential | Résidentiel partiel |
| 3 | Non Residential | Non résidentiel |
| 4 | Unknown | Inconnu |

### Province Codes

| Code | Abbreviation | Name (English) | Name (Français) |
|------|--------------|----------------|-----------------|
| 10 | NL | Newfoundland and Labrador | Terre-Neuve-et-Labrador |
| 11 | PE | Prince Edward Island | Île-du-Prince-Édouard |
| 12 | NS | Nova Scotia | Nouvelle-Écosse |
| 13 | NB | New Brunswick | Nouveau-Brunswick |
| 24 | QC | Quebec | Québec |
| 35 | ON | Ontario | Ontario |
| 46 | MB | Manitoba | Manitoba |
| 47 | SK | Saskatchewan | Saskatchewan |
| 48 | AB | Alberta | Alberta |
| 59 | BC | British Columbia | Colombie-Britannique |
| 60 | YT | Yukon | Yukon |
| 61 | NT | Northwest Territories | Territoires du Nord-Ouest |
| 62 | NU | Nunavut | Nunavut |

---

## Technical Specifications

### GUID Format

**Format:** Hexadecimal unique ID in string format

**Structure:**
- **Length:** 36 characters (including dashes)
- **Pattern:** `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`
- **Character Set:** Hexadecimal (0-9, a-f)
- **Example:** `12345678-1234-1234-1234-123456789abc`

**Usage:**
- Assigned to both location and address entities
- Enables referencing of specific entities
- Facilitates efficient retrieval of attributes

**Regex Pattern:**
```regex
^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$
```

### Coordinate Systems

#### EPSG:4326 (WGS84 Geographic)

**Fields:** `BG_LATITUDE`, `BG_LONGITUDE`

- **Datum:** WGS84 (World Geodetic System 1984)
- **Type:** Geographic (latitude/longitude)
- **Units:** Decimal degrees
- **Axis Order:** Latitude, Longitude
- **Usage:** Standard GPS coordinates, web mapping

**Coordinate Ranges:**
- Latitude: -90 to +90 (Canada: ~41.68 to ~83.11)
- Longitude: -180 to +180 (Canada: ~-141.00 to ~-52.62)

#### EPSG:3347 (Statistics Canada Lambert)

**Fields:** `BG_X`, `BG_Y`

- **Datum:** NAD83
- **Type:** Projected (Lambert Conformal Conic)
- **Units:** Meters
- **Purpose:** Canada-wide projected coordinate system
- **Usage:** Statistical analysis, area calculations

**Characteristics:**
- Optimized for Canadian geography
- Preserves area measurements
- Used for national statistical mapping

### Dominion Land Survey (DLS)

The DLS is a land survey system used primarily in Western Canada (Manitoba, Saskatchewan, Alberta, parts of British Columbia).

**Fields:**
- `BG_DLS_LSD` - Legal Subdivision (1-16 within a section)
- `BG_DLS_QTR` - Quarter (NE, NW, SE, SW)
- `BG_DLS_SCTN` - Section (1-36 within a township)
- `BG_DLS_TWNSHP` - Township (numbered north from US border)
- `BG_DLS_RNG` - Range (numbered west from meridian)
- `BG_DLS_MRD` - Meridian (1-7, reference lines)

**Usage:** Rural property identification in Western Canada

---

## Practical Examples

### JSON Examples

#### Example 1: Single Dwelling
```json
{
  "LOC_GUID": "12345678-1234-1234-1234-123456789abc",
  "ADDR_GUID": "12345678-1234-1234-1234-123456789Bbc",
  "APT_NO_LABEL": null,
  "CIVIC_NO": "1",
  "CIVIC_NO_SUFFIX": null,
  "OFFICIAL_STREET_NAME": "MAIN",
  "OFFICIAL_STREET_TYPE": "ST",
  "OFFICIAL_STREET_DIR": null,
  "PROV_CODE": "35",
  "CSD_CODE": "3520005",
  "CSD_ENG_NAME": "Toronto",
  "ER_CODE": "520",
  "ER_ENG_NAME": "Toronto",
  "FED_CODE": "35077",
  "FED_ENG_NAME": "Toronto Centre",
  "MAIL_STREET_NAME": "MAIN",
  "MAIL_STREET_TYPE": "ST",
  "MAIL_MUN_NAME": "TORONTO",
  "MAIL_PROV_ABVN": "ON",
  "MAIL_POSTAL_CODE": "M1M 1A1",
  "BG_LATITUDE": 43.6532,
  "BG_LONGITUDE": -79.3832,
  "BG_X": 1234567.89,
  "BG_Y": 7654321.01,
  "BU_USE": "1"
}
```

#### Example 2: Multi-Unit Building
```json
{
  "LOC_GUID": "22345678-1234-1234-1234-123456789abc",
  "ADDR_GUID": "22345678-1234-1234-1234-123456789Zbc",
  "APT_NO_LABEL": "2",
  "CIVIC_NO": "123",
  "CIVIC_NO_SUFFIX": null,
  "OFFICIAL_STREET_NAME": "MAIN",
  "OFFICIAL_STREET_TYPE": "ST",
  "OFFICIAL_STREET_DIR": null,
  "PROV_CODE": "35",
  "CSD_CODE": "3520005",
  "CSD_ENG_NAME": "Toronto",
  "MAIL_STREET_NAME": "MAIN",
  "MAIL_STREET_TYPE": "ST",
  "MAIL_MUN_NAME": "TORONTO",
  "MAIL_PROV_ABVN": "ON",
  "MAIL_POSTAL_CODE": "M2M 1A1",
  "BG_LATITUDE": 43.6532,
  "BG_LONGITUDE": -79.3832,
  "BG_X": 1234567.89,
  "BG_Y": 7654321.01,
  "BU_USE": "2"
}
```

#### Example 3: Rural Address with DLS
```json
{
  "LOC_GUID": "33345678-1234-1234-1234-123456789abc",
  "ADDR_GUID": "33345678-1234-1234-1234-123456789Cbc",
  "APT_NO_LABEL": null,
  "CIVIC_NO": "45",
  "OFFICIAL_STREET_NAME": "RANGE ROAD",
  "OFFICIAL_STREET_TYPE": "RD",
  "PROV_CODE": "48",
  "CSD_ENG_NAME": "Rural Municipality",
  "MAIL_PROV_ABVN": "AB",
  "MAIL_POSTAL_CODE": "T0A 0B0",
  "BG_DLS_LSD": "12",
  "BG_DLS_QTR": "NW",
  "BG_DLS_SCTN": "15",
  "BG_DLS_TWNSHP": "52",
  "BG_DLS_RNG": "25",
  "BG_DLS_MRD": "4",
  "BG_LATITUDE": 53.5461,
  "BG_LONGITUDE": -113.4937,
  "BU_USE": "1"
}
```

### SQL DDL

#### Location Table
```sql
CREATE TABLE nar_location (
    loc_guid VARCHAR(36) PRIMARY KEY,
    bg_latitude DECIMAL(10, 7),
    bg_longitude DECIMAL(11, 7),
    bg_x DECIMAL(12, 2),
    bg_y DECIMAL(12, 2),
    bg_dls_lsd VARCHAR(10),
    bg_dls_qtr VARCHAR(2),
    bg_dls_sctn VARCHAR(10),
    bg_dls_twnshp VARCHAR(10),
    bg_dls_rng VARCHAR(10),
    bg_dls_mrd VARCHAR(10),
    CONSTRAINT chk_guid_format CHECK (
        loc_guid ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    )
);

CREATE INDEX idx_location_coords ON nar_location(bg_latitude, bg_longitude);
CREATE INDEX idx_location_projected ON nar_location(bg_x, bg_y);
```

#### Address Table
```sql
CREATE TABLE nar_address (
    addr_guid VARCHAR(36) PRIMARY KEY,
    loc_guid VARCHAR(36) NOT NULL,
    apt_no_label VARCHAR(20),
    civic_no VARCHAR(20) NOT NULL,
    civic_no_suffix VARCHAR(10),
    official_street_name VARCHAR(100) NOT NULL,
    official_street_type VARCHAR(20),
    official_street_dir VARCHAR(2),
    prov_code VARCHAR(2) NOT NULL,
    csd_code VARCHAR(7),
    csd_type_eng_code VARCHAR(10),
    csd_type_fre_code VARCHAR(10),
    csd_eng_name VARCHAR(100),
    csd_fre_name VARCHAR(100),
    er_code VARCHAR(10),
    er_eng_name VARCHAR(100),
    er_fre_name VARCHAR(100),
    fed_code VARCHAR(5),
    fed_eng_name VARCHAR(100),
    fed_fre_name VARCHAR(100),
    mail_street_name VARCHAR(100),
    mail_street_type VARCHAR(20),
    mail_street_dir VARCHAR(2),
    mail_mun_name VARCHAR(100),
    mail_prov_abvn VARCHAR(2),
    mail_postal_code VARCHAR(7),
    bu_use VARCHAR(1),
    bu_n_civic_add VARCHAR(200),
    CONSTRAINT fk_location FOREIGN KEY (loc_guid) 
        REFERENCES nar_location(loc_guid),
    CONSTRAINT chk_addr_guid_format CHECK (
        addr_guid ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ),
    CONSTRAINT chk_bu_use CHECK (bu_use IN ('1', '2', '3', '4'))
);

CREATE INDEX idx_address_location ON nar_address(loc_guid);
CREATE INDEX idx_address_province ON nar_address(prov_code);
CREATE INDEX idx_address_postal ON nar_address(mail_postal_code);
CREATE INDEX idx_address_csd ON nar_address(csd_code);
CREATE INDEX idx_address_fed ON nar_address(fed_code);
```

#### Building Usage Reference Table
```sql
CREATE TABLE nar_building_usage (
    code VARCHAR(1) PRIMARY KEY,
    description_eng VARCHAR(50) NOT NULL,
    description_fre VARCHAR(50) NOT NULL
);

INSERT INTO nar_building_usage VALUES
    ('1', 'Residential', 'Résidentiel'),
    ('2', 'Partial Residential', 'Résidentiel partiel'),
    ('3', 'Non Residential', 'Non résidentiel'),
    ('4', 'Unknown', 'Inconnu');
```

#### Province Reference Table
```sql
CREATE TABLE nar_province (
    code VARCHAR(2) PRIMARY KEY,
    abbreviation VARCHAR(2) UNIQUE NOT NULL,
    name_eng VARCHAR(50) NOT NULL,
    name_fre VARCHAR(50) NOT NULL
);

INSERT INTO nar_province VALUES
    ('10', 'NL', 'Newfoundland and Labrador', 'Terre-Neuve-et-Labrador'),
    ('11', 'PE', 'Prince Edward Island', 'Île-du-Prince-Édouard'),
    ('12', 'NS', 'Nova Scotia', 'Nouvelle-Écosse'),
    ('13', 'NB', 'New Brunswick', 'Nouveau-Brunswick'),
    ('24', 'QC', 'Quebec', 'Québec'),
    ('35', 'ON', 'Ontario', 'Ontario'),
    ('46', 'MB', 'Manitoba', 'Manitoba'),
    ('47', 'SK', 'Saskatchewan', 'Saskatchewan'),
    ('48', 'AB', 'Alberta', 'Alberta'),
    ('59', 'BC', 'British Columbia', 'Colombie-Britannique'),
    ('60', 'YT', 'Yukon', 'Yukon'),
    ('61', 'NT', 'Northwest Territories', 'Territoires du Nord-Ouest'),
    ('62', 'NU', 'Nunavut', 'Nunavut');
```

### Sample Queries

#### Query 1: Find all addresses at a location
```sql
SELECT 
    a.addr_guid,
    a.apt_no_label,
    a.civic_no,
    a.official_street_name,
    a.official_street_type,
    a.mail_postal_code
FROM nar_address a
WHERE a.loc_guid = '22345678-1234-1234-1234-123456789abc'
ORDER BY a.apt_no_label;
```

#### Query 2: Search addresses by province and municipality
```sql
SELECT 
    a.addr_guid,
    a.civic_no || ' ' || a.official_street_name || ' ' || COALESCE(a.official_street_type, '') AS full_address,
    a.csd_eng_name,
    p.name_eng AS province_name
FROM nar_address a
JOIN nar_province p ON a.prov_code = p.code
WHERE a.prov_code = '35'  -- Ontario
    AND a.csd_eng_name = 'Toronto'
LIMIT 100;
```

#### Query 3: Geospatial proximity search (within 1km)
```sql
-- Using PostGIS or spatial extension
SELECT 
    a.addr_guid,
    a.civic_no || ' ' || a.official_street_name AS address,
    l.bg_latitude,
    l.bg_longitude,
    ST_Distance(
        ST_SetSRID(ST_MakePoint(l.bg_longitude, l.bg_latitude), 4326)::geography,
        ST_SetSRID(ST_MakePoint(-79.3832, 43.6532), 4326)::geography
    ) AS distance_meters
FROM nar_address a
JOIN nar_location l ON a.loc_guid = l.loc_guid
WHERE ST_DWithin(
    ST_SetSRID(ST_MakePoint(l.bg_longitude, l.bg_latitude), 4326)::geography,
    ST_SetSRID(ST_MakePoint(-79.3832, 43.6532), 4326)::geography,
    1000  -- 1km radius
)
ORDER BY distance_meters
LIMIT 50;
```

#### Query 4: Count addresses by building usage and province
```sql
SELECT 
    p.abbreviation,
    p.name_eng,
    bu.description_eng AS building_usage,
    COUNT(*) AS address_count
FROM nar_address a
JOIN nar_province p ON a.prov_code = p.code
JOIN nar_building_usage bu ON a.bu_use = bu.code
GROUP BY p.abbreviation, p.name_eng, bu.description_eng
ORDER BY p.abbreviation, bu.code;
```

#### Query 5: Find multi-unit buildings
```sql
SELECT 
    l.loc_guid,
    COUNT(DISTINCT a.addr_guid) AS unit_count,
    MIN(a.civic_no || ' ' || a.official_street_name || ' ' || COALESCE(a.official_street_type, '')) AS address,
    MIN(a.mail_postal_code) AS postal_code
FROM nar_location l
JOIN nar_address a ON l.loc_guid = a.loc_guid
GROUP BY l.loc_guid
HAVING COUNT(DISTINCT a.addr_guid) > 1
ORDER BY unit_count DESC
LIMIT 100;
```

---

## Additional Resources

### Census Geography

- **Census Subdivision Boundary File, Reference Guide**
  - https://www.statcan.gc.ca/

- **Standard Geographical Classification (SGC)**
  - https://www.statcan.gc.ca/

### Canada Post Standards

- **Street Types, Street Directions, Provinces and Territories**
  - Canada Post Addressing Guidelines
  - https://www.canadapost-postescanada.ca/

### Statistics Canada

- **Main Website:** https://www.statcan.gc.ca
- **Email:** infostats@statcan.gc.ca
- **Phone:** 1-800-263-1136 (Monday-Friday, 8:30 AM - 4:30 PM)
- **TTY:** 1-800-363-7629 (hearing impaired)
- **Fax:** 1-514-283-9350

### Licensing

- **Statistics Canada Open Licence Agreement**
  - https://www.statcan.gc.ca/en/reference/licence
  
- **Open Government Licence – Yukon**
  - https://open.yukon.ca/open-government-licence-yukon

### Standards

- **Service Standards:** https://www.statcan.gc.ca/ (Contact us > Standards of service to the public)
- **HTML Version:** Available on Statistics Canada website

---

## Contact Information

### NAR-Specific Inquiries

**Email:** statcan.statisticalregistersinfo-inforegistresstatistiques.statcan@statcan.gc.ca

**Purpose:** Feedback, suggestions, questions, or concerns about the National Address Register

### General Statistics Canada Contact

**Website:** https://www.statcan.gc.ca  
**Email:** infostats@statcan.gc.ca  
**Phone:** 1-800-263-1136  
**Hours:** Monday to Friday, 8:30 AM to 4:30 PM (ET)

---

## Appendix: Geographic Definitions

### Census Division (CD)

General term for provincially legislated areas (county, municipalité régionale de comté, regional district) or equivalents. In provinces/territories without such legislation, Statistics Canada defines equivalent areas for statistical reporting. Census divisions are intermediate geographic areas between province/territory and municipality levels.

### Census Subdivision (CSD) 2025

General term for municipalities (as determined by provincial/territorial legislation) or areas treated as municipal equivalents for statistical purposes (e.g., Indian reserves, Indian settlements, unorganized territories). Municipal status is defined by laws in effect in each province and territory.

### Economic Region (ER) 2021

Grouping of complete census divisions (CDs) created as a standard geographic unit for analysis of regional economic activity.

### Federal Electoral District (FED) 2023

Area represented by a member of the House of Commons. The 2023 Representation Order (proclaimed September 22, 2023) was based on 2021 Census population counts and increased the number of FEDs to 343 (up from 338 in the 2013 Representation Order).

---

## Data Quality Notes

### Coordinate Precision

Coordinates (BG_LATITUDE, BG_LONGITUDE, BG_X, BG_Y) represent **representative points** associated with buildings. They are intended for geospatial reference but:

- May **not** correspond exactly to the physical center of the building
- Can represent road access points or driveways
- Should be used for approximate location reference, not precise building footprints

### Address Validation

Addresses are:
- Extracted from Statistics Canada's Building Register
- Validated by two independent data sources
- Standardized according to government and postal conventions

### Privacy

All addresses in the NAR are **non-confidential**:
- Do not disclose identity of residents or businesses
- Safe for public distribution and use

---

**Document Version:** 1.0  
**Last Updated:** July 18, 2025  
**Document Purpose:** Technical reference for developers and data engineers working with the National Address Register dataset
