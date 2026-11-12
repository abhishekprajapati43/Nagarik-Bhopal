# Ward master data

Bhopal Municipal Corporation (BMC) ward master data is stored in PostgreSQL and
served through the existing ward APIs. The frontend no longer carries a
hardcoded ward list for reporting: the searchable ward picker, the complaint
details page, the admin console, analytics and the map all read the same
`wards` rows.

## What changed

An additive migration (`006_ward_master_data`) keeps every existing column and
complaint link and adds the BMC attributes:

| Column | Type | Notes |
| --- | --- | --- |
| `ward_number` | `integer` | Unique when present; indexed |
| `zone_number` | `integer` | BMC zone 1–19; indexed |
| `assembly_constituency` | `text` | Indexed (lower-case) |
| `councillor_name` | `text` | Primary source for the elected councillor |
| `councillor_mobile` | `text` | 10-digit mobile, primary source |
| `population` | `integer` | Optional 2011 population baseline |
| `is_default` | `boolean` | Official BMC rows cannot be deleted |

Existing columns remain in place: `name`, `area`, `zone`, `center_lat`,
`center_lng`, `representative_id`, `assigned_officer_id`, timestamps. The
representative row stays an optional satellite for office address, email and
MLA name; the ward master is always the primary source for the councillor's
name and mobile.

Indexes added: unique `ward_number`, `zone_number`,
`lower(assembly_constituency)`, `lower(councillor_name)`, `lower(name)` and
`lower(area)`. The `zone` text accepts the BMC label `Zone N` as well as the
five legacy compass values.

The migration also backfills ward numbers for the eight demo rows and marks all
rows that have a ward number as `is_default`, so an administrator cannot delete
an official ward.

## Importing the BMC ward list

The fixture lives in `backend/db/data/bhopal-wards.json` and contains 85 unique
wards with number, English ward name, area, zone, assembly constituency,
councillor name/mobile, population and centroid.

```bash
npm run db:setup           # applies 006_ward_master_data
npm run db:import-wards    # upserts the fixture
npm run db:import-wards -- path/to/wards.csv
```

The importer accepts a JSON array, `{ "wards": [...] }` or a CSV with a header
row. Header aliases such as `wardNumber`/`ward_number`/`wardNo`, `zoneNumber`,
`assemblyConstituency`, `councillorName` and `councillorMobile` are supported.

Rows are matched by ward number first and then by lower-case name. Existing
demo rows keep their IDs, so complaint, representative and officer assignments
are preserved. Imported wards are flagged `is_default = true`. The importer
never renames or re-points an existing representative row; it only fills its
office address, email and MLA name when the import file supplies them.

## API

REST:

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/wards` | Public; supports `search`, `wardNumber`, `zoneNumber`, `assemblyConstituency`, `assignedOfficerId`, `unassignedOfficer` |
| GET | `/api/wards/heatmap` | Public; ward-level complaint totals for the map |
| POST / PUT | `/api/wards` | Admin; create or update a ward master record |
| DELETE | `/api/wards/:id` | Admin; rejects `is_default` wards and wards that still have complaints |

RPC bridge:

- `listWards` — forwards the same filters.
- `getWard` — `{ id }`, returns one serialized ward.
- `saveWard` — admin create/update, including officer and representative
  assignment.
- `assignWard` — admin quick assignment: `{ id, officerId, representativeId? }`.
- `wardHeatmap` — public map payload: ward number/name/area, centre, total,
  pending, resolved and an `updatedAt` timestamp.

A serialized ward includes both the master names and compatibility aliases used
by the existing UI:

```json
{
  "id": "…",
  "wardNumber": 1,
  "name": "Mahatma Gandhi",
  "wardName": "Mahatma Gandhi",
  "area": "Mahatma Gandhi",
  "zone": "Zone 1",
  "zoneNumber": 1,
  "assemblyConstituency": "Berasia (SC)",
  "councillorName": "Mr. Laxman Rajput",
  "councillorMobile": "7587988901",
  "population": 22106,
  "isDefault": true,
  "assignedOfficerId": "",
  "officerId": "",
  "representativeId": "",
  "complaints": 0,
  "pending": 0,
  "resolved": 0,
  "averageResolutionDays": 0
}
```

Complaints store `ward_id` as the foreign key and expose the master attributes
as `wardNumber`, `wardArea`, `wardZone`, `wardZoneNumber`,
`wardAssemblyConstituency`, `wardCouncillorName` and `wardCouncillorMobile`.
The legacy `ward`, `representative` and `representativePhone` fields now fall
back to the ward master when the representative satellite is empty.

## Routing and notifications

When a complaint is created with a valid `wardId`:

1. The ward row is loaded from PostgreSQL; an unknown ID is rejected.
2. If the ward has `assigned_officer_id`, the complaint is accepted and assigned
   to that officer, and the officer receives a notification that includes the
   ward number and name.
3. If the ward has no officer, the complaint stays `Pending` and every
   administrator receives a “Pending queue” notification with the ward number
   and name so it can be assigned manually.

The admin new-complaint notification also includes the ward label. Complaints
without a selected ward are still supported by the legacy GPS fallback for
older clients, but the current report form requires a ward from the master.

## UI

- **Report complaint** — searchable ward picker (number, name, area, zone,
  assembly constituency, councillor name/mobile). Selecting a ward shows an
  information card with area, zone, assembly constituency, councillor and
  councillor mobile. Submission is blocked without a ward.
- **Complaint details** — new “Ward information” section sourced from the ward
  master, alongside the existing representative block.
- **Admin → Wards** — search/filter by text, zone and officer; edit every
  master field; assign a sanitation officer or representative; default BMC
  wards show a “Protected” badge instead of a delete button; the table supports
  a one-click officer assignment.
- **Admin → Analytics** — ward-wise table with total, pending, resolved,
  average resolution days and the top complaint category.
- **Admin → Complaints** — zone filter, ward labels with numbers, and search
  across ward number/name/area/zone/constituency/councillor/mobile.
- **Map** — ward-based green/yellow/red levels (scaled to the busiest ward),
  ward popups with total/pending/resolved, and a 30-second refresh so levels
  follow complaint changes. The map does not subscribe to the live bus, so a
  refresh triggers exactly one `wardHeatmap` call per interval instead of a
  request loop.

## Testing

Automated API checks used during implementation:

1. `npm run db:setup` and `npm run db:import-wards` — 85 wards, 77 inserted and
   8 updated on the first run.
2. `listWards` returns 85 rows with number, area, zone, constituency and
   councillor; search and filters return the expected subset.
3. `getWard` returns one ward; `wardHeatmap` returns every ward with a centre.
4. Admin create → assign → duplicate-number rejection → delete works; deleting
   a default BMC ward is rejected.
5. An officer token cannot call `assignWard`.
6. `listComplaints` accepts `zoneNumber` and rejects an out-of-range value.
7. A complaint created in a ward without an officer stays `Pending`, exposes
   the ward master fields, and creates an admin “Pending queue” notification
   containing the ward number and name.
8. A complaint created in a ward with an officer is auto-assigned and notifies
   that officer with the ward label.

Manual browser checks:

1. Sign in as a resident, open **Register complaint**, search “Mahatma”, pick
   Ward 1, confirm the ward card shows area/zone/constituency/councillor.
2. Open an existing complaint and confirm the Ward information section.
3. Sign in as admin, open **Wards**, search by councillor/mobile/zone, edit a
   ward, change its officer and confirm the “Pending queue” filter updates.
4. Open **Analytics** and confirm the ward-wise table has 85 rows.
5. Open **Map**, confirm 85 coloured ward circles and the green/yellow/red
   legend; leave it open for a minute and confirm the "updated" time changes
   once per 30-second interval with no repeated request loop.

## Data provenance and known limits

The original BMC ward master document was not present in the workspace when the
fixture was prepared, so the fixture was assembled from public sources:

- English ward names 1–85 from the LGD KML (`ward_lgd_name`).
- Zone number, population and ward polygon centroids from the DataMeet
  `Bhopal_wards.geojson` set (86 features, duplicate ward 76 removed).
- Current councillor names/mobiles from IndiaCustomerCare (2022 winners,
  including the 2024 Ward 41 by-poll); Ward 13's name from myCorporator.
- Assembly constituencies derived by point-in-polygon of the ward centroid
  against the DataMeet Madhya Pradesh ECI assembly boundaries.

`area` is seeded from the official ward name because no authoritative
locality/main-area dataset was available. It remains fully editable in the
admin console. Assembly constituencies are centroid-derived approximations, not
an official ward-to-AC mapping. The Ward 13 councillor mobile
(`7587988913`) follows the exact numbering pattern of the other published
numbers but was not independently verified. Replace the fixture and re-run the
importer once the official BMC document is available; the upsert preserves
ward IDs and live complaint links.
