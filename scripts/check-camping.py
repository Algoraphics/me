#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
import urllib.request
from zoneinfo import ZoneInfo

VIVARIUM_PATH = Path(os.environ.get('VIVARIUM_PATH', '../Vivarium'))
CAMPING_PATH = VIVARIUM_PATH / 'camping'
REC_AREAS_FILE = CAMPING_PATH / 'rec-areas.json'
FAVORITES_FILE = CAMPING_PATH / 'favorites.json'
AVAILABILITY_FILE = CAMPING_PATH / 'availability.json'
SCAN_STATE_FILE = CAMPING_PATH / 'scan-state.json'

DISCORD_WEBHOOK_URL = os.environ.get('DISCORD_CAMPING_WEBHOOK')
PACIFIC_TZ = ZoneInfo('America/Los_Angeles')

def parse_args():
    parser = argparse.ArgumentParser(description='Camping availability scanner')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--sites', help='Comma-separated list of rec area IDs to scan')
    mode.add_argument('--rotation', action='store_true', help='Run rotation scan (ignores favorites)')
    mode.add_argument('--favorites', action='store_true', help='Scan only favorites')
    parser.add_argument('--start-date', help='Override start date (YYYY-MM-DD)')
    parser.add_argument('--end-date', help='Override end date (YYYY-MM-DD)')
    parser.add_argument('--dry-run', action='store_true', help='Run without saving state or sending notifications')
    parser.add_argument('--verbose', '-v', action='store_true', help='Extra logging for debugging')
    return parser.parse_args()

def log(msg, verbose_only=False):
    if verbose_only and not getattr(log, 'verbose', False):
        return
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def load_json(path, default=None):
    if not path.exists():
        return default if default is not None else {}
    with open(path) as f:
        return json.load(f)

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def send_discord_notification(message, dry_run=False):
    if dry_run:
        log(f"[DRY RUN] Would send Discord: {message[:100]}...")
        return
    if not DISCORD_WEBHOOK_URL:
        log("No Discord webhook configured, skipping notification")
        return
    
    data = json.dumps({"content": message}).encode('utf-8')
    req = urllib.request.Request(
        DISCORD_WEBHOOK_URL,
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    try:
        urllib.request.urlopen(req)
        log("Discord notification sent")
    except Exception as e:
        log(f"Failed to send Discord notification: {e}")

def is_quiet_hours():
    now = datetime.now(PACIFIC_TZ)
    return 0 <= now.hour < 8

def run_camply(args, verbose=False, dry_run=False):
    full_command = ['camply'] + args
    command_str = ' '.join(full_command)
    
    if dry_run:
        log(f"[DRY RUN] Would run: {command_str}")
        return {
            'stdout': '',
            'stderr': '',
            'returncode': 0,
            'duration': 0,
            'dry_run': True
        }
    
    if verbose:
        log(f"Running: {command_str}")
    
    start_time = datetime.now()
    try:
        result = subprocess.run(
            full_command,
            capture_output=True,
            text=True,
            timeout=600
        )
        duration = (datetime.now() - start_time).total_seconds()
        
        return {
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode,
            'duration': duration
        }
    except subprocess.TimeoutExpired:
        log(f"Command timed out after 600s")
        return {'stdout': '', 'stderr': 'Timeout', 'returncode': 1, 'duration': 600}
    except FileNotFoundError:
        log("camply command not found")
        return {'stdout': '', 'stderr': 'Command not found', 'returncode': 1, 'duration': 0}

def parse_camply_output(stdout, area_name, provider):
    results = {
        'total_sites': 0,
        'campgrounds': [],
        'dates': [],
        'weekend_dates': [],
        'booking_urls': []
    }
    
    total_match = re.search(r'(\d+)\s+Reservable Campsites', stdout)
    if total_match:
        results['total_sites'] = int(total_match.group(1))
    
    for line in stdout.split('\n'):
        date_match = re.search(r'📅\s+(Sun|Sat|Mon|Tue|Wed|Thu|Fri),\s+(\w+)\s+(\d+)\s+🏕\s+(\d+)\s+sites?', line)
        if date_match:
            day_name = date_match.group(1)
            month_name = date_match.group(2)
            day_num = date_match.group(3)
            site_count = int(date_match.group(4))
            
            try:
                year = datetime.now().year
                date_str = f"{month_name} {day_num}, {year}"
                date_obj = datetime.strptime(date_str, "%B %d, %Y")
                if date_obj < datetime.now():
                    date_obj = date_obj.replace(year=year + 1)
                
                formatted_date = date_obj.strftime('%Y-%m-%d')
                results['dates'].append({
                    'date': formatted_date,
                    'day': day_name,
                    'sites': site_count
                })
                
                if day_name in ('Sat', 'Sun', 'Fri'):
                    results['weekend_dates'].append(formatted_date)
            except ValueError:
                pass
        
        campground_match = re.search(r'🏕\s+([^:]+):\s+⛺\s+(\d+)\s+sites?', line)
        if campground_match:
            results['campgrounds'].append({
                'name': campground_match.group(1).strip(),
                'sites': int(campground_match.group(2))
            })
        
        url_match = re.search(r'(https://www\.recreation\.gov/camping/campsites/\d+)', line)
        if url_match:
            if url_match.group(1) not in results['booking_urls']:
                results['booking_urls'].append(url_match.group(1))
    
    return results

def select_rotation_areas(rec_areas, favorites_data, scan_state):
    disabled = set(favorites_data.get('disabled', []))
    enabled = [area for area in rec_areas if area['id'] not in disabled]
    
    if not enabled:
        log("No enabled areas to scan")
        return []
    
    enabled = sorted(enabled, key=lambda a: a['id'])
    
    current_index = scan_state.get('currentIndex', 0) % len(enabled)
    sites_per_run = scan_state.get('sitesPerRun', 4)
    
    selected = []
    for i in range(sites_per_run):
        idx = (current_index + i) % len(enabled)
        selected.append(enabled[idx])
    
    log(f"Rotation mode: scanning {len(selected)} areas starting at index {current_index}")
    return selected

def select_favorites_areas(rec_areas, favorites_data):
    favorites = set(favorites_data.get('favorites', []))
    disabled = set(favorites_data.get('disabled', []))
    
    if not favorites:
        log("No favorites to scan")
        return []
    
    selected = [area for area in rec_areas if area['id'] in favorites and area['id'] not in disabled]
    log(f"Favorites mode: scanning {len(selected)} favorite areas")
    return selected

def scan_area_month_by_month(area_data, start_date=None, end_date=None, verbose=False, dry_run=False):
    rec_id = area_data['id']
    provider = area_data.get('provider', 'RecreationDotGov')
    name = area_data.get('name', rec_id)
    
    log(f"Scanning {name}...")
    
    if start_date and end_date:
        args = [
            'campsites',
            '--rec-area', str(rec_id),
            '--start-date', start_date,
            '--end-date', end_date,
            '--provider', provider,
            '--notifications', 'silent',
            '--search-once'
        ]
        
        result = run_camply(args, verbose, dry_run)
        if result.get('dry_run'):
            return {
                'success': True,
                'parsed': {'total_sites': 0, 'campgrounds': [], 'dates': [], 'weekend_dates': [], 'booking_urls': []},
                'duration': 0
            }
        if result['returncode'] != 0:
            log(f"  Error: {result['stderr'][:200]}")
            return {'success': False, 'error': result['stderr']}
        
        parsed = parse_camply_output(result['stdout'], name, provider)
        log(f"  Found {parsed['total_sites']} sites, {len(parsed['weekend_dates'])} weekend dates ({result['duration']:.1f}s)")
        return {
            'success': True,
            'parsed': parsed,
            'duration': result['duration']
        }
    
    all_results = {
        'total_sites': 0,
        'campgrounds': [],
        'dates': [],
        'weekend_dates': [],
        'booking_urls': []
    }
    total_duration = 0
    
    base_date = datetime.now()
    
    for month_offset in range(6):
        month_start = base_date + timedelta(days=30 * month_offset)
        month_end = month_start + timedelta(days=30)
        
        start_str = month_start.strftime('%Y-%m-%d')
        end_str = month_end.strftime('%Y-%m-%d')
        
        log(f"  Month {month_offset + 1}/6: {start_str} to {end_str}...", verbose_only=True)
        
        args = [
            'campsites',
            '--rec-area', str(rec_id),
            '--start-date', start_str,
            '--end-date', end_str,
            '--provider', provider,
            '--notifications', 'silent',
            '--search-once'
        ]
        
        result = run_camply(args, verbose, dry_run)
        total_duration += result['duration']
        
        if result.get('dry_run'):
            break
        
        if result['returncode'] != 0:
            log(f"  Month {month_offset + 1} error: {result['stderr'][:100]}", verbose_only=True)
            continue
        
        parsed = parse_camply_output(result['stdout'], name, provider)
        
        all_results['total_sites'] += parsed['total_sites']
        all_results['dates'].extend(parsed['dates'])
        all_results['weekend_dates'].extend(parsed['weekend_dates'])
        all_results['booking_urls'].extend(parsed['booking_urls'])
        
        for cg in parsed['campgrounds']:
            existing = next((c for c in all_results['campgrounds'] if c['name'] == cg['name']), None)
            if existing:
                existing['sites'] += cg['sites']
            else:
                all_results['campgrounds'].append(cg)
        
        if parsed['weekend_dates']:
            log(f"  Found availability in month {month_offset + 1}! ({parsed['total_sites']} sites, {len(parsed['weekend_dates'])} weekend dates)")
            break
    
    all_results['weekend_dates'] = sorted(list(set(all_results['weekend_dates'])))
    all_results['booking_urls'] = list(set(all_results['booking_urls']))[:10]
    
    log(f"  Total: {all_results['total_sites']} sites, {len(all_results['weekend_dates'])} weekend dates ({total_duration:.1f}s)")
    
    if all_results['campgrounds']:
        top_campgrounds = sorted(all_results['campgrounds'], key=lambda x: x['sites'], reverse=True)[:3]
        for cg in top_campgrounds:
            log(f"    - {cg['name']}: {cg['sites']} sites")
    
    return {
        'success': True,
        'parsed': all_results,
        'duration': total_duration
    }

def calculate_booking_horizon(weekend_dates):
    if not weekend_dates:
        return None
    
    today = datetime.now().date()
    days_out = []
    
    for date_str in sorted(weekend_dates)[:3]:
        try:
            date = datetime.strptime(date_str, '%Y-%m-%d').date()
            days_out.append((date - today).days)
        except ValueError:
            pass
    
    if not days_out:
        return None
    
    return int(sum(days_out) / len(days_out))

def process_notifications(rec_areas, results_by_id, favorites_data, dry_run=False):
    if not favorites_data.get('settings', {}).get('notificationsEnabled', False):
        log("Notifications disabled, skipping")
        return
    
    favorites = set(favorites_data.get('favorites', []))
    if not favorites:
        return
    
    quiet = is_quiet_hours()
    now = datetime.now()
    
    areas_by_id = {area['id']: area for area in rec_areas}
    areas_to_notify = {}
    
    for area_id, result in results_by_id.items():
        if area_id not in favorites:
            continue
        
        area = areas_by_id.get(area_id, {})
        parsed = result.get('parsed', {})
        
        prev_availability = set(area.get('recentWeekendAvailability', []))
        curr_availability = set(parsed.get('weekend_dates', []))
        
        if curr_availability == prev_availability:
            continue
        
        new_dates = curr_availability - prev_availability
        if not new_dates:
            continue
        
        last_notified = area.get('lastNotifiedAt')
        if last_notified:
            try:
                last_dt = datetime.fromisoformat(last_notified)
                if (now - last_dt).total_seconds() < 48 * 3600:
                    continue
            except:
                pass
        
        areas_to_notify[area_id] = {
            'name': area.get('name', area_id),
            'new_dates': sorted(list(new_dates)),
            'total_sites': parsed.get('total_sites', 0)
        }
    
    if not areas_to_notify:
        return
    
    if quiet:
        log(f"Quiet hours - marking {len(areas_to_notify)} areas for later notification")
        for area_id in areas_to_notify:
            area = areas_by_id.get(area_id)
            if area:
                area['notified'] = False
        return
    
    pending = [area['id'] for area in rec_areas if not area.get('notified', True) and area['id'] in favorites]
    all_to_notify = set(areas_to_notify.keys()) | set(pending)
    
    if all_to_notify:
        message = "🏕️ **New Campsite Availability!**\n\n"
        for area_id in all_to_notify:
            info = areas_to_notify.get(area_id, {})
            area = areas_by_id.get(area_id, {})
            name = info.get('name') or area.get('name', area_id)
            dates = info.get('new_dates', [])
            sites = info.get('total_sites', 0)
            
            message += f"**{name}**"
            if sites:
                message += f" ({sites} sites)"
            message += "\n"
            if dates:
                message += f"New dates: {', '.join(dates[:5])}"
                if len(dates) > 5:
                    message += f" +{len(dates) - 5} more"
                message += "\n"
            message += "\n"
        
        message += f"🔗 https://ethanrabb.com/camping"
        send_discord_notification(message, dry_run)
        
        for area_id in all_to_notify:
            area = areas_by_id.get(area_id)
            if area:
                area['notified'] = True
                area['lastNotifiedAt'] = now.isoformat()

def main():
    args = parse_args()
    log.verbose = args.verbose
    
    log("Starting camping availability scan")
    log(f"  dry_run={args.dry_run}, verbose={args.verbose}")
    
    rec_areas = load_json(REC_AREAS_FILE, [])
    favorites_data = load_json(FAVORITES_FILE, {'favorites': [], 'disabled': [], 'settings': {'notificationsEnabled': False}})
    scan_state = load_json(SCAN_STATE_FILE, {
        'currentIndex': 0,
        'sitesPerRun': 4
    })
    availability = load_json(AVAILABILITY_FILE, {'lastScan': None, 'openings': []})
    
    if not rec_areas:
        log("No recreation areas found. Run build_rec_areas.py first.")
        return 1
    
    if args.sites:
        site_ids = set(s.strip() for s in args.sites.split(','))
        areas_to_scan = [area for area in rec_areas if area['id'] in site_ids]
        log(f"Manual mode: scanning {len(areas_to_scan)} specified areas")
    elif args.favorites:
        areas_to_scan = select_favorites_areas(rec_areas, favorites_data)
    elif args.rotation:
        areas_to_scan = select_rotation_areas(rec_areas, favorites_data, scan_state)
    else:
        log("No scan mode specified. Use --sites, --rotation, or --favorites")
        return 1
    
    if not areas_to_scan:
        log("No areas to scan")
        return 0
    
    results_by_id = {}
    scan_success = True
    areas_by_id = {area['id']: area for area in rec_areas}
    
    for area_data in areas_to_scan:
        result = scan_area_month_by_month(
            area_data, 
            args.start_date, 
            args.end_date, 
            args.verbose,
            args.dry_run
        )
        
        if not result['success']:
            log(f"  Error scanning {area_data.get('name')}: {result.get('error', 'Unknown error')}")
            scan_success = False
            continue
        
        area_id = area_data['id']
        results_by_id[area_id] = result
        parsed = result['parsed']
        
        area = areas_by_id[area_id]
        area['lastScanned'] = datetime.now().isoformat()
        area['recentWeekendAvailability'] = parsed['weekend_dates'][:5]
        
        horizon = calculate_booking_horizon(parsed['weekend_dates'])
        if horizon:
            area['bookingHorizon'] = horizon
    
    process_notifications(rec_areas, results_by_id, favorites_data, args.dry_run)
    
    openings = []
    for area_id, result in results_by_id.items():
        parsed = result.get('parsed', {})
        area = areas_by_id.get(area_id, {})
        
        if parsed.get('total_sites', 0) > 0:
            openings.append({
                'recAreaId': area_id,
                'recAreaName': area.get('name', ''),
                'provider': area.get('provider', 'RecreationDotGov'),
                'totalSites': parsed['total_sites'],
                'weekendDates': parsed['weekend_dates'][:5],
                'topCampgrounds': parsed['campgrounds'][:5],
                'bookingUrls': parsed['booking_urls'][:5]
            })
    
    if not args.dry_run and scan_success:
        if args.rotation:
            disabled = set(favorites_data.get('disabled', []))
            enabled = [area for area in rec_areas if area['id'] not in disabled]
            enabled = sorted(enabled, key=lambda a: a['id'])
            num_enabled = len(enabled)
            if num_enabled > 0:
                sites_per_run = scan_state.get('sitesPerRun', 4)
                new_index = (scan_state.get('currentIndex', 0) + sites_per_run) % num_enabled
                scan_state['currentIndex'] = new_index
                log(f"Updated rotation index to {new_index}")
        
        availability['lastScan'] = datetime.now().isoformat()
        availability['openings'] = openings
        
        save_json(REC_AREAS_FILE, rec_areas)
        save_json(SCAN_STATE_FILE, scan_state)
        save_json(AVAILABILITY_FILE, availability)
        log("Saved state files")
    
    log(f"\n=== SCAN SUMMARY ===")
    if args.dry_run:
        log("[DRY RUN MODE] No commands were actually executed")
        log(f"Would have scanned {len(areas_to_scan)} areas")
        for area_data in areas_to_scan:
            log(f"  - {area_data.get('name')} (ID: {area_data['id']}, Provider: {area_data.get('provider', 'RecreationDotGov')})")
    else:
        log(f"Areas scanned: {len(results_by_id)}")
        total_sites = sum(r.get('parsed', {}).get('total_sites', 0) for r in results_by_id.values())
        total_weekend = sum(len(r.get('parsed', {}).get('weekend_dates', [])) for r in results_by_id.values())
        log(f"Total availability: {total_sites} sites, {total_weekend} weekend dates")
        
        for area_id, result in results_by_id.items():
            parsed = result.get('parsed', {})
            area = areas_by_id.get(area_id, {})
            name = area.get('name', area_id)
            sites = parsed.get('total_sites', 0)
            weekends = len(parsed.get('weekend_dates', []))
            duration = result.get('duration', 0)
            log(f"  {name}: {sites} sites, {weekends} weekends ({duration:.0f}s)")
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
