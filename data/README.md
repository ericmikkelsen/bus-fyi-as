# GTFS Data Directory

This directory contains GTFS (General Transit Feed Specification) data from transit agencies.

## Structure

Each agency should have its own subdirectory:

```
data/
├── agency-1/
│   ├── agency.txt
│   ├── routes.txt
│   ├── stops.txt
│   ├── trips.txt
│   ├── stop_times.txt
│   └── calendar.txt
├── agency-2/
│   └── ...
└── README.md
```

## GTFS Files

Standard GTFS feed contains the following files:

### Required Files

- **agency.txt** - Transit agencies with service represented in the dataset
- **stops.txt** - Individual locations where vehicles pick up or drop off riders
- **routes.txt** - Transit routes (bus lines, subway lines, etc.)
- **trips.txt** - Trips for each route
- **stop_times.txt** - Times that a vehicle arrives at and departs from stops
- **calendar.txt** - Service dates specified using a weekly schedule

### Optional Files

- **calendar_dates.txt** - Exceptions to the service dates defined in calendar.txt
- **fare_attributes.txt** - Fare information
- **fare_rules.txt** - Rules for applying fares
- **shapes.txt** - Vehicle travel paths
- **frequencies.txt** - Headway (frequency) information
- **transfers.txt** - Transfer rules between routes
- **feed_info.txt** - Metadata about the feed

## Example GTFS Data Sources

You can download GTFS data from various transit agencies:

- [TransitFeeds](https://transitfeeds.com/)
- [Mobility Database](https://mobilitydatabase.org/)
- Local transit agency websites

## Usage

1. Create a directory for your transit agency: `mkdir data/your-agency`
2. Download GTFS files from your transit agency
3. Extract the files into the agency directory
4. Run the build process: `npm run build`

## Note

This directory is not tracked by git (see `.gitignore`). Each user should download and manage their own GTFS data.
