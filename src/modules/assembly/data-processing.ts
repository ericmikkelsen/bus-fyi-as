// Data processing utilities in AssemblyScript
// Parent-child relationships, time grouping, etc.

/**
 * Build parent-child relationships from stops data
 * Returns array of parent IDs that have children
 */
export function buildParentChildMap(
  stopIds: string[],
  parentStations: string[]
): Map<string, string[]> {
  const childrenMap = new Map<string, string[]>();
  
  for (let i = 0; i < stopIds.length; i++) {
    const parentId = parentStations[i];
    if (parentId.length > 0) {
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      const children = childrenMap.get(parentId);
      children.push(stopIds[i]);
      childrenMap.set(parentId, children);
    }
  }
  
  return childrenMap;
}

/**
 * Get hour from GTFS time string (HH:MM:SS)
 * Handles times >= 24:00:00 (next day service)
 */
export function getHourFromTime(timeStr: string): i32 {
  if (timeStr.length == 0) return 0;
  
  const colonIndex = timeStr.indexOf(':');
  if (colonIndex < 0) return 0;
  
  const hourStr = timeStr.substring(0, colonIndex);
  return I32.parseInt(hourStr);
}

/**
 * Group stop times by hour
 * Returns hours that have stop times
 */
export function groupStopTimesByHour(arrivalTimes: string[]): i32[] {
  const hoursSet = new Set<i32>();
  
  for (let i = 0; i < arrivalTimes.length; i++) {
    const hour = getHourFromTime(arrivalTimes[i]);
    hoursSet.add(hour);
  }
  
  // Convert set to sorted array
  const hours: i32[] = [];
  const values = hoursSet.values();
  for (let i = 0; i < values.length; i++) {
    hours.push(values[i]);
  }
  
  // Sort hours
  hours.sort((a: i32, b: i32): i32 => a - b);
  
  return hours;
}

/**
 * Filter stop times for a specific hour
 */
export function filterStopTimesByHour(
  arrivalTimes: string[],
  hour: i32
): i32[] {
  const indices: i32[] = [];
  
  for (let i = 0; i < arrivalTimes.length; i++) {
    if (getHourFromTime(arrivalTimes[i]) == hour) {
      indices.push(i);
    }
  }
  
  return indices;
}

/**
 * Format time from HH:MM:SS to readable format (e.g., "6:00 AM")
 */
export function formatTimeReadable(timeStr: string): string {
  if (timeStr.length == 0) return '';
  
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  
  let hours = I32.parseInt(parts[0]);
  const minutes = parts[1];
  
  // Handle times >= 24:00:00 (next day service)
  if (hours >= 24) {
    hours = hours - 24;
  }
  
  const period = hours >= 12 ? 'PM' : 'AM';
  let displayHours = hours;
  if (hours == 0) {
    displayHours = 12;
  } else if (hours > 12) {
    displayHours = hours - 12;
  }
  
  return displayHours.toString() + ':' + minutes + ' ' + period;
}

/**
 * Get service days from calendar booleans
 * Returns comma-separated string like "Mon,Tue,Wed,Thu,Fri"
 */
export function getServiceDaysString(
  monday: string,
  tuesday: string,
  wednesday: string,
  thursday: string,
  friday: string,
  saturday: string,
  sunday: string
): string {
  const days: string[] = [];
  
  if (monday == '1') days.push('Mon');
  if (tuesday == '1') days.push('Tue');
  if (wednesday == '1') days.push('Wed');
  if (thursday == '1') days.push('Thu');
  if (friday == '1') days.push('Fri');
  if (saturday == '1') days.push('Sat');
  if (sunday == '1') days.push('Sun');
  
  return days.join(',');
}

/**
 * Sort indices by corresponding arrival times
 */
export function sortByArrivalTime(
  indices: i32[],
  arrivalTimes: string[]
): i32[] {
  const sorted = indices.slice();
  
  // Simple bubble sort (good enough for small arrays within an hour)
  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = 0; j < sorted.length - i - 1; j++) {
      const time1 = arrivalTimes[sorted[j]];
      const time2 = arrivalTimes[sorted[j + 1]];
      if (time1 > time2) {
        const temp = sorted[j];
        sorted[j] = sorted[j + 1];
        sorted[j + 1] = temp;
      }
    }
  }
  
  return sorted;
}
