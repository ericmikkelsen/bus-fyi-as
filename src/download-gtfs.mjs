#!/usr/bin/env node

/**
 * GTFS Data Downloader
 * 
 * Downloads and extracts GTFS zip files from URLs specified in environment variables.
 * Looks for any env var starting with GTFS_ZIP_URL (e.g., GTFS_ZIP_URL_CTA, GTFS_ZIP_URL_BART)
 * and downloads them to the data/ directory, then extracts the zip files.
 * 
 * Default: Chicago Transit Authority (CTA) GTFS data
 * 
 * Usage:
 *   npm run download:gtfs
 *   
 * With custom URLs:
 *   GTFS_ZIP_URL_BART=https://www.bart.gov/.../gtfs.zip npm run download:gtfs
 */

import { createWriteStream, mkdirSync, existsSync, readdirSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default GTFS URLs
const DEFAULT_GTFS_URLS = {
  'cta': 'https://www.transitchicago.com/downloads/sch_data/google_transit.zip'
};

/**
 * Extract agency name from URL or env var name
 */
function getAgencyName(url, envVarName) {
  // Try to extract from env var name first (e.g., GTFS_ZIP_URL_BART -> bart)
  if (envVarName && envVarName.startsWith('GTFS_ZIP_URL_')) {
    const name = envVarName.replace('GTFS_ZIP_URL_', '').toLowerCase();
    if (name) return name;
  }
  
  // Try to extract from URL
  if (url.includes('bart.gov')) return 'bart';
  if (url.includes('transitchicago')) return 'cta';
  if (url.includes('sfmta')) return 'sfmta';
  
  // Default to timestamp-based name
  return `agency-${Date.now()}`;
}

/**
 * Download a file from URL to destination
 */
async function downloadFile(url, dest) {
  console.log(`Downloading ${url}...`);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }
    
    const fileStream = createWriteStream(dest);
    await pipeline(response.body, fileStream);
    
    console.log(`✓ Downloaded to ${dest}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to download ${url}:`, error.message);
    console.error(`  You may need to manually download the file and place it in the data directory.`);
    return false;
  }
}

/**
 * Extract a zip file to a directory
 */
async function extractZip(zipPath, extractDir) {
  console.log(`Extracting ${zipPath}...`);
  
  try {
    // Try using unzip command
    await execAsync(`unzip -o "${zipPath}" -d "${extractDir}"`);
    console.log(`✓ Extracted to ${extractDir}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to extract ${zipPath}:`, error.message);
    console.error(`  You may need to manually extract the zip file.`);
    return false;
  }
}

/**
 * Main function to download all GTFS data
 */
async function downloadGTFSData() {
  console.log('GTFS Data Downloader\n');
  
  // Ensure data directory exists
  const dataDir = join(__dirname, '..', 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  
  // Collect all GTFS URLs from env vars
  const gtfsUrls = new Map();
  
  // Check environment variables for GTFS_ZIP_URL*
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('GTFS_ZIP_URL') && value) {
      const agencyName = getAgencyName(value, key);
      gtfsUrls.set(agencyName, value);
      console.log(`Found env var ${key}: ${value} (agency: ${agencyName})`);
    }
  }
  
  // If no env vars found, use defaults
  if (gtfsUrls.size === 0) {
    console.log('No GTFS_ZIP_URL* environment variables found. Using defaults:\n');
    for (const [agency, url] of Object.entries(DEFAULT_GTFS_URLS)) {
      gtfsUrls.set(agency, url);
      console.log(`  ${agency}: ${url}`);
    }
  }
  
  console.log(`\nDownloading ${gtfsUrls.size} GTFS feed(s)...\n`);
  
  // Download all feeds
  let successCount = 0;
  let failCount = 0;
  let extractCount = 0;
  
  for (const [agency, url] of gtfsUrls) {
    const agencyDir = join(dataDir, agency);
    
    // Create agency directory
    if (!existsSync(agencyDir)) {
      mkdirSync(agencyDir, { recursive: true });
    }
    
    // Download zip file
    const zipPath = join(agencyDir, 'google_transit.zip');
    const downloadSuccess = await downloadFile(url, zipPath);
    
    if (downloadSuccess) {
      successCount++;
      
      // Extract zip file
      const extractSuccess = await extractZip(zipPath, agencyDir);
      if (extractSuccess) {
        extractCount++;
      }
      
      console.log(`Agency "${agency}" data saved to: ${agencyDir}\n`);
    } else {
      failCount++;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Download Summary:`);
  console.log(`  ✓ Downloaded: ${successCount}`);
  console.log(`  ✓ Extracted: ${extractCount}`);
  console.log(`  ✗ Failed: ${failCount}`);
  console.log(`  Total: ${gtfsUrls.size}`);
  console.log('='.repeat(50));
  
  if (extractCount > 0) {
    console.log('\nNext steps:');
    console.log('  Run: npm run generate:stops');
  } else if (successCount > 0) {
    console.log('\nNext steps:');
    console.log('  1. Extract the zip files in data/[agency]/ directories');
    console.log('  2. Run: npm run generate:stops');
  }
  
  // Show data directory contents
  console.log('\nData directory contents:');
  const agencies = readdirSync(dataDir).filter(f => f !== 'README.md');
  if (agencies.length > 0) {
    agencies.forEach(agency => {
      console.log(`  - ${agency}/`);
    });
  } else {
    console.log('  (empty)');
  }
  
  return successCount > 0;
}

// Run the downloader
downloadGTFSData()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
