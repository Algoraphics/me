#!/usr/bin/env python3
import argparse
import json
import os
import sys
import logging
import io
import requests
import signal
from base64 import b64decode
from datetime import datetime, timedelta, timezone
from pathlib import Path
import urllib.request
from zoneinfo import ZoneInfo

from camply.search import SearchRecreationDotGov, SearchReserveCalifornia
from camply.containers import SearchWindow
from camply.providers import RecreationDotGov, ReserveCalifornia

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
    parser.add_argument('--rotation-size', type=int, default=10, help='Number of areas to scan in rotation mode (default: 10)')
    parser.add_argument('--start-date', help='Override start date (YYYY-MM-DD)')
    parser.add_argument('--end-date', help='Override end date (YYYY-MM-DD)')
    parser.add_argument('--dry-run', action='store_true', help='Run without saving state or sending notifications')
    parser.add_argument('--verbose', '-v', action='store_true', help='Extra logging for debugging')
    return parser.parse_args()

def log(msg, verbose_only=False, flush=True):
    if verbose_only and not getattr(log, 'verbose', False):
        return
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=flush)

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

class TimeoutException(Exception):
    pass

def timeout_handler(signum, frame):
    raise TimeoutException("Query timeout")

def scan_campground_with_camply(campground_id, campground_name, start_date, end_date, provider_name, verbose=False, timeout_seconds=10):
    """
    Scan a single campground using camply Python API (RecreationDotGov only).
    Returns dict with success status and availability data.
    """
    try:
        search_window = SearchWindow(start_date=start_date, end_date=end_date)
        
        if provider_name == 'RecreationDotGov':
            searcher = SearchRecreationDotGov(
                search_window=search_window,
                campgrounds=[campground_id]
            )
        else:
            return {'success': False, 'error': f'Unsupported provider: {provider_name}'}
        
        # Set a timeout alarm
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(timeout_seconds)
        
        try:
            campsites = searcher.get_matching_campsites(log=False, verbose=False, continuous=False)
        finally:
            signal.alarm(0)
        
        available_dates = {}
        weekend_dates = []
        campground_names = set()
        
        for campsite in campsites:
            date_str = campsite.booking_date.strftime('%Y-%m-%d')
            if date_str not in available_dates:
                available_dates[date_str] = 0
            available_dates[date_str] += 1
            
            if campsite.booking_date.weekday() in [4, 5]:
                if date_str not in weekend_dates:
                    weekend_dates.append(date_str)
            
            if hasattr(campsite, 'facility_name'):
                campground_names.add(campsite.facility_name)
        
        return {
            'success': True,
            'total_sites': len(campsites),
            'available_dates': available_dates,
            'weekend_dates': sorted(weekend_dates),
            'campground_names': list(campground_names)
        }
        
    except TimeoutException:
        return {
            'success': False,
            'error': 'Query timeout (10s)',
            'is_validation_error': False
        }
    except Exception as e:
        error_msg = str(e)
        is_validation_error = 'ValidationError' in error_msg
        
        if verbose:
            log(f"  Error details: {error_msg[:200]}")
        
        return {
            'success': False,
            'error': error_msg[:200],
            'is_validation_error': is_validation_error
        }

def scan_rec_area_with_camply(rec_area_id, rec_area_name, start_date, end_date, provider_name, verbose=False, timeout_seconds=10):
    """
    Scan entire rec area at once (for providers like ReserveCalifornia that don't support per-campground).
    Returns dict with success status and campground-level data.
    """
    try:
        search_window = SearchWindow(start_date=start_date, end_date=end_date)
        numeric_id = int(rec_area_id.replace('recgov-', '').replace('reserveca-', ''))
        
        if provider_name == 'ReserveCalifornia':
            searcher = SearchReserveCalifornia(
                search_window=search_window,
                recreation_area=[numeric_id]
            )
        else:
            return {'success': False, 'error': f'Provider {provider_name} not supported for rec-area scan'}
        
        # Set a timeout alarm
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(timeout_seconds)
        
        try:
            campsites = searcher.get_matching_campsites(log=False, verbose=False, continuous=False)
        finally:
            signal.alarm(0)
        
        # Aggregate by campground
        by_campground = {}
        for campsite in campsites:
            cg_name = campsite.facility_name
            date_str = campsite.booking_date.strftime('%Y-%m-%d')
            is_weekend = campsite.booking_date.weekday() in [4, 5]
            
            if cg_name not in by_campground:
                by_campground[cg_name] = {
                    'facility_id': campsite.facility_id if hasattr(campsite, 'facility_id') else None,
                    'sites': 0,
                    'weekend_dates': set()
                }
            
            by_campground[cg_name]['sites'] += 1
            if is_weekend:
                by_campground[cg_name]['weekend_dates'].add(date_str)
        
        # Aggregate total weekend dates
        all_weekend_dates = set()
        for cg_data in by_campground.values():
            all_weekend_dates.update(cg_data['weekend_dates'])
        
        return {
            'success': True,
            'total_sites': len(campsites),
            'by_campground': by_campground,
            'weekend_dates': sorted(all_weekend_dates)
        }
        
    except TimeoutException:
        return {
            'success': False,
            'error': 'Query timeout (10s)',
            'is_validation_error': False
        }
    except Exception as e:
        error_msg = str(e)
        is_validation_error = 'ValidationError' in error_msg
        
        if verbose:
            log(f"  Error details: {error_msg[:200]}")
        
        return {
            'success': False,
            'error': error_msg[:200],
            'is_validation_error': is_validation_error
        }

def select_rotation_areas(rec_areas, favorites_data, scan_state, rotation_size=4):
    disabled = set(favorites_data.get('disabled', [])) | set(favorites_data.get('autoDisabled', []))
    enabled = [area for area in rec_areas if area['id'] not in disabled]
    
    if not enabled:
        log("No enabled areas to scan")
        return []
    
    enabled = sorted(enabled, key=lambda a: a['id'])
    
    current_index = scan_state.get('currentIndex', 0) % len(enabled)
    
    selected = []
    for i in range(rotation_size):
        idx = (current_index + i) % len(enabled)
        selected.append(enabled[idx])
    
    log(f"Rotation mode: scanning {len(selected)} areas starting at index {current_index}")
    return selected

def select_favorites_areas(rec_areas, favorites_data):
    favorites = set(favorites_data.get('favorites', []))
    disabled = set(favorites_data.get('disabled', [])) | set(favorites_data.get('autoDisabled', []))
    
    if not favorites:
        log("No favorites to scan")
        return []
    
    selected = [area for area in rec_areas if area['id'] in favorites and area['id'] not in disabled]
    log(f"Favorites mode: scanning {len(selected)} favorite areas")
    return selected

def get_area_image_url(rec_id, provider_name):
    """Fetch official image URL from Recreation.gov API"""
    try:
        numeric_id = int(rec_id.replace('recgov-', '').replace('reserveca-', ''))
        
        if provider_name == 'RecreationDotGov':
            # Use RIDB API to get media
            api_key = b64decode(b"YTc0MTY0NzEtMWI1ZC00YTY0LWFkM2QtYTIzM2U3Y2I1YzQ0").decode("utf-8")
            
            url = f"https://ridb.recreation.gov/api/v1/recareas/{numeric_id}/media"
            response = requests.get(
                url,
                headers={'apikey': api_key},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                media_items = data.get('RECDATA', [])
                
                # Find first image
                for item in media_items:
                    if item.get('URL') and item.get('MediaType') == 'Image':
                        return item['URL']
        
        return None
    except Exception:
        return None

def get_campgrounds_for_area(rec_id, provider_name, verbose=False):
    """Get list of campgrounds for a recreation area"""
    
    # Set up logging to capture camply's messages
    camply_logger = logging.getLogger('camply')
    log_capture = io.StringIO()
    handler = logging.StreamHandler(log_capture)
    handler.setLevel(logging.INFO)
    camply_logger.addHandler(handler)
    camply_logger.setLevel(logging.INFO)
    
    try:
        numeric_id = int(rec_id.replace('recgov-', '').replace('reserveca-', ''))
        
        if provider_name == 'RecreationDotGov':
            provider = RecreationDotGov()
            campgrounds = provider.find_campgrounds(rec_area_id=[numeric_id])
        elif provider_name == 'ReserveCalifornia':
            provider = ReserveCalifornia()
            campgrounds = provider.find_campgrounds(rec_area_id=[numeric_id])
        else:
            return (None, f"Provider {provider_name} not yet supported")
        
        # Get camply's log output
        log_output = log_capture.getvalue()
        
        # Show relevant camply messages
        for line in log_output.split('\n'):
            if 'Matching Campgrounds Found' in line or 'Retrieving Facility' in line:
                message = line.split(' - ')[-1].strip() if ' - ' in line else line.strip()
                if message:
                    log(f"  [camply] {message}")
        
        return (campgrounds, None)
    except Exception as e:
        log(f"  Exception during campground lookup: {str(e)[:200]}")
        return (None, str(e)[:200])
    finally:
        camply_logger.removeHandler(handler)

def scan_area_month_by_month(area_data, start_date=None, end_date=None, verbose=False, dry_run=False):
    rec_id = area_data['id']
    provider = area_data.get('provider', 'RecreationDotGov')
    name = area_data.get('name', rec_id)
    
    log(f"Scanning {name}...")
    
    if dry_run:
        log(f"  [DRY RUN] Would scan rec area {rec_id}")
        return {
            'success': True,
            'parsed': {'total_sites': 0, 'weekend_dates': []},
            'duration': 0
        }
    
    import time
    start_time = time.time()
    
    log(f"  Getting campgrounds list...")
    campgrounds, error = get_campgrounds_for_area(rec_id, provider, verbose)
    
    if error:
        log(f"  API error getting campgrounds: {error}")
        return {
            'success': False,
            'error': error,
            'duration': time.time() - start_time
        }
    
    if not campgrounds:
        return {
            'success': True,
            'parsed': {'total_sites': 0, 'weekend_dates': []},
            'duration': time.time() - start_time,
            'no_campgrounds': True,
            'area_id': rec_id
        }
    
    all_results = {
        'total_sites': 0,
        'weekend_dates': set(),
        'failed_campgrounds': [],
        'any_success': False
    }
    
    if start_date and end_date:
        scan_start = datetime.strptime(start_date, '%Y-%m-%d')
        scan_end = datetime.strptime(end_date, '%Y-%m-%d')
        num_months = 1
    else:
        scan_start = datetime.now()
        scan_end = None
        num_months = 6
    
    for month_offset in range(num_months):
        month_start = scan_start + timedelta(days=30 * month_offset) if not end_date else scan_start
        month_end = month_start + timedelta(days=30) if not end_date else scan_end
        
        month_key = month_start.strftime('%Y-%m')
        log(f"  Month {month_offset + 1}/{num_months}: {month_key}")
        
        month_sites = 0
        month_weekends = 0
        successful = 0
        
        # ReserveCalifornia: Query entire rec area at once (can't do per-campground)
        if provider == 'ReserveCalifornia':
            result = scan_rec_area_with_camply(rec_id, name, month_start, month_end, provider, verbose)
            
            if result['success']:
                month_sites = result['total_sites']
                month_weekends = len(result.get('weekend_dates', []))
                all_results['total_sites'] += result['total_sites']
                all_results['weekend_dates'].update(result.get('weekend_dates', []))
                all_results['any_success'] = True
                all_results['consecutive_failures'] = 0
                
                log(f"  Scanned entire rec area: {month_sites} sites, {month_weekends} weekend dates")
                successful = len(campgrounds)
            else:
                log(f"  Rec area scan failed: {result.get('error', 'Unknown error')[:100]}")
        
        # RecreationDotGov: Query each campground separately (more resilient)
        else:
            for i, cg in enumerate(campgrounds, 1):
                cg_id = cg.facility_id
                cg_name = cg.facility_name
                
                result = scan_campground_with_camply(
                    cg_id, cg_name, month_start, month_end, provider, verbose
                )
                
                if result['success']:
                    month_sites += result['total_sites']
                    month_weekends += len(result.get('weekend_dates', []))
                    all_results['total_sites'] += result['total_sites']
                    all_results['weekend_dates'].update(result.get('weekend_dates', []))
                    all_results['any_success'] = True
                    
                    successful += 1
                    
                    # Show availability info
                    num_dates = len(result.get('available_dates', {}))
                    num_weekends = len(result.get('weekend_dates', []))
                    if result['total_sites'] > 0:
                        log(f"    [{i}/{len(campgrounds)}] {cg_name}: ✓ ({result['total_sites']} sites, {num_dates} dates, {num_weekends} weekends)")
                    else:
                        log(f"    [{i}/{len(campgrounds)}] {cg_name}: ✓ (no availability)")
                else:
                    is_validation = result.get('is_validation_error', False)
                    error_msg = result.get('error', 'Unknown error')[:100]
                    error_type = "validation error" if is_validation else "error"
                    log(f"    [{i}/{len(campgrounds)}] {cg_name}: ✗ ({error_type}: {error_msg})")
                    
                    all_results['failed_campgrounds'].append({
                        'name': cg_name,
                        'id': cg_id,
                        'error': error_msg,
                        'is_validation': is_validation
                    })
        
        log(f"  Month {month_offset + 1} summary: {month_sites} sites, {month_weekends} weekend dates ({successful}/{len(campgrounds)} campgrounds)")
        
        if month_weekends > 0:
            log(f"  ✓ Found weekend availability! Stopping scan.")
            all_results['any_success'] = True
            break
        
        if end_date:
            break
    
    weekend_list = sorted(list(all_results['weekend_dates']))
    
    duration = time.time() - start_time
    
    # If all attempts failed (no successful queries), return error
    if not all_results['any_success'] and provider == 'ReserveCalifornia':
        log(f"  All scan attempts failed ({duration:.1f}s)")
        return {
            'success': False,
            'error': 'All months timed out or failed',
            'duration': duration
        }
    
    log(f"  Total: {all_results['total_sites']} sites, {len(weekend_list)} weekend dates ({duration:.1f}s)")
    
    if all_results['failed_campgrounds']:
        validation_errors = [c for c in all_results['failed_campgrounds'] if c['is_validation']]
        other_errors = [c for c in all_results['failed_campgrounds'] if not c['is_validation']]
        
        if validation_errors:
            log(f"  Note: {len(validation_errors)} campground(s) had validation errors (skipped)")
        if other_errors:
            log(f"  Warning: {len(other_errors)} campground(s) had other errors")
    
    if weekend_list:
        log(f"  Weekend dates with availability ({len(weekend_list)} total):")
        for date in weekend_list[:10]:
            weekday = datetime.strptime(date, '%Y-%m-%d').strftime('%a')
            log(f"    - {date} ({weekday})")
        if len(weekend_list) > 10:
            log(f"    ... and {len(weekend_list) - 10} more")
    
    return {
        'success': True,
        'parsed': {
            'total_sites': all_results['total_sites'],
            'weekend_dates': weekend_list[:50]
        },
        'duration': duration,
        'failed_campgrounds': all_results['failed_campgrounds']
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
    now = datetime.now(timezone.utc)
    
    areas_by_id = {area['id']: area for area in rec_areas}
    areas_to_notify = {}
    
    for area_id, result in results_by_id.items():
        if area_id not in favorites:
            continue
        
        area = areas_by_id.get(area_id, {})
        parsed = result.get('parsed', {})
        
        prev_dates = set(area.get('weekendDates', []))
        curr_dates = set(parsed.get('weekend_dates', []))
        
        if curr_dates == prev_dates:
            continue
        
        new_dates = curr_dates - prev_dates
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
    
    # Load immutable area metadata
    rec_areas_metadata = load_json(REC_AREAS_FILE, [])
    metadata_by_id = {area['id']: area for area in rec_areas_metadata}
    
    # Load dynamic scan state
    scan_state = load_json(SCAN_STATE_FILE, {
        'currentIndex': 0,
        'areas': {}
    })
    
    # Merge scan state into rec areas for processing
    rec_areas = []
    for area_meta in rec_areas_metadata:
        merged_area = {**area_meta}
        state_data = scan_state.get('areas', {}).get(area_meta['id'], {})
        merged_area.update(state_data)
        rec_areas.append(merged_area)
    
    areas_by_id = {area['id']: area for area in rec_areas}
    
    favorites_data = load_json(FAVORITES_FILE, {'favorites': [], 'disabled': [], 'autoDisabled': [], 'settings': {'notificationsEnabled': False}})
    
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
        areas_to_scan = select_rotation_areas(rec_areas, favorites_data, scan_state, args.rotation_size)
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
        
        area_id = area_data['id']
        area = areas_by_id[area_id]
        
        if not result['success']:
            log(f"  Error scanning {area_data.get('name')}: {result.get('error', 'Unknown error')}")
            area['scanError'] = True
            area['lastScanned'] = datetime.now(timezone.utc).isoformat()
            scan_success = False
            continue
        
        results_by_id[area_id] = result
        parsed = result['parsed']
        
        area['scanError'] = False
        
        if result.get('no_campgrounds'):
            log(f"  Auto-disabling {area_data.get('name')} (no campgrounds)")
            if 'autoDisabled' not in favorites_data:
                favorites_data['autoDisabled'] = []
            if area_id not in favorites_data['autoDisabled']:
                favorites_data['autoDisabled'].append(area_id)
        
        area['lastScanned'] = datetime.now(timezone.utc).isoformat()
        area['weekendDates'] = parsed['weekend_dates'][:10]
        
        horizon = calculate_booking_horizon(parsed['weekend_dates'])
        if horizon:
            area['bookingHorizon'] = horizon
        
        # Fetch image if we don't have one yet (opportunistic enrichment)
        # Check against original metadata, not merged area
        if not metadata_by_id[area_id].get('imageUrl'):
            image_url = get_area_image_url(area_id, area.get('provider', 'RecreationDotGov'))
            if image_url:
                metadata_by_id[area_id]['imageUrl'] = image_url
                area['imageUrl'] = image_url
                log(f"  Fetched official image", verbose_only=True)
    
    process_notifications(rec_areas, results_by_id, favorites_data, args.dry_run)
    
    if not args.dry_run and scan_success:
        if args.rotation:
            disabled = set(favorites_data.get('disabled', [])) | set(favorites_data.get('autoDisabled', []))
            enabled = [area for area in rec_areas if area['id'] not in disabled]
            enabled = sorted(enabled, key=lambda a: a['id'])
            num_enabled = len(enabled)
            if num_enabled > 0:
                new_index = (scan_state.get('currentIndex', 0) + args.rotation_size) % num_enabled
                scan_state['currentIndex'] = new_index
                log(f"Updated rotation index to {new_index}")
        
        # Extract scan state from areas before saving
        for area in rec_areas:
            area_id = area['id']
            state_info = {}
            
            if area.get('lastScanned'):
                state_info['lastScanned'] = area['lastScanned']
            if area.get('weekendDates'):
                state_info['weekendDates'] = area['weekendDates']
            if area.get('bookingHorizon'):
                state_info['bookingHorizon'] = area['bookingHorizon']
            if 'scanError' in area:
                state_info['scanError'] = area['scanError']
            if area.get('notified') is not None:
                state_info['notified'] = area['notified']
            if area.get('lastNotifiedAt'):
                state_info['lastNotifiedAt'] = area['lastNotifiedAt']
            
            if state_info:
                scan_state['areas'][area_id] = state_info
        
        # Save all state files
        save_json(REC_AREAS_FILE, rec_areas_metadata)
        save_json(SCAN_STATE_FILE, scan_state)
        save_json(FAVORITES_FILE, favorites_data)
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
