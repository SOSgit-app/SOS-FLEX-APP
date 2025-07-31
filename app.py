from flask import Flask, render_template, request, redirect, url_for, session, send_file, jsonify
import random
from datetime import datetime, timedelta
import csv
import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from io import BytesIO
from copy import deepcopy
import zipfile
from io import StringIO
import xlsxwriter
import pandas as pd
from werkzeug.utils import secure_filename
import os

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # Required for session

# Add mock data for freezing
app.config['MOCK_SESSION_DATA'] = {
    'class_name': 'Sample Class',
    'start_time': '08:00',
    'arrival_time': '07:30',
    'num_fields': 8,
    'referees': {},
    'schedule': [],
    'flex_b_schedule': []
}

def is_freezing():
    return app.config.get('FREEZING', False)

def generate_schedule(selected_classes, start_time, num_fields, avoid_matchups=None, flexible_scheduling=False, custom_fields=None):
    if not selected_classes:
        return [], []

    # Group flights by squadron
    knights = [f for f in selected_classes if f.startswith('A')]
    bulls = [f for f in selected_classes if f.startswith('B')]
    centurions = [f for f in selected_classes if f.startswith('C')]
    tigers = [f for f in selected_classes if f.startswith('F')]
    
    # Distribute flights to fields more evenly
    if custom_fields:
        # Use provided custom fields
        fields = custom_fields
    else:
        # Create new empty fields
        fields = [[] for _ in range(num_fields)]
        
        if flexible_scheduling:
            # For special case with fewer squadrons (like 2 squadrons with 19 flights)
            # Just assign flights to fields to balance the load without strict squadron segregation
            all_flights = selected_classes.copy()
            random.shuffle(all_flights)
            
            # Simple round-robin assignment to balance field load
            for i, flight in enumerate(all_flights):
                fields[i % num_fields].append(flight)
        else:
            # Use original field assignment logic 
            # Try to distribute flights evenly across fields while ensuring each field has different squadrons
            all_squadrons = [knights, bulls, centurions, tigers]
            field_idx = 0
            
            # First pass: distribute one flight from each squadron to each field
            for squadron in all_squadrons:
                if squadron:
                    flights = squadron.copy()
                    random.shuffle(flights)
                    while flights and field_idx < num_fields:
                        fields[field_idx].append(flights.pop())
                        field_idx = (field_idx + 1) % num_fields
            
            # Second pass: distribute remaining flights
            remaining_flights = []
            for squadron in all_squadrons:
                remaining_flights.extend([f for f in squadron if not any(f in field for field in fields)])
            
            random.shuffle(remaining_flights)
            for flight in remaining_flights:
                # Find field with fewest flights and no squadron conflict
                valid_fields = []
                for i, field in enumerate(fields):
                    squadron_in_field = {f[0] for f in field}
                    if flight[0] not in squadron_in_field:
                        valid_fields.append((i, len(field)))
                
                if valid_fields:
                    # Choose the field with fewest flights
                    field_idx = min(valid_fields, key=lambda x: x[1])[0]
                else:
                    # If no field without squadron conflict, choose least populated field
                    field_idx = min(range(num_fields), key=lambda i: len(fields[i]))
                
                fields[field_idx].append(flight)

    # Generate schedule for each field
    schedule = []
    start_dt = datetime.strptime(start_time, '%H:%M')

    # Track games played for all flights across all fields
    all_games_played = {flight: 0 for flight in selected_classes}
    all_played_against = {flight: set() for flight in selected_classes}

    # Process each field
    for field_num, field_flights in enumerate(fields, 1):
        if len(field_flights) < 2:
            continue

        current_time = start_dt
        match_number = 1

        # For flexible scheduling with 4 or 5 flights per field, use a specialized approach
        if flexible_scheduling and len(field_flights) >= 4 and len(field_flights) <= 5:
            n = len(field_flights)
            
            if n == 5:  # 5 flights pattern
                # Create the pattern shown in the reference example:
                # A07 vs B22, A08 vs B23, A15 vs A07, A08 vs B22, A15 vs B23
                flights = field_flights.copy()
                flights.sort()  # Sort to make the pattern predictable
                
                matches = []
                
                # Group by squadron
                squadrons = {}
                for flight in flights:
                    squadron = flight[0]  # First character is the squadron
                    if squadron not in squadrons:
                        squadrons[squadron] = []
                    squadrons[squadron].append(flight)
                
                if len(squadrons) == 2:
                    squadA = None
                    squadB = None
                    
                    # Find the squadrons with the right number of flights
                    for squad, squad_flights in squadrons.items():
                        if len(squad_flights) == 3:
                            squadA = squad
                        elif len(squad_flights) == 2:
                            squadB = squad
                    
                    # If we have the right distribution (3 flights from one squadron, 2 from another)
                    if squadA and squadB and len(squadrons[squadA]) == 3 and len(squadrons[squadB]) == 2:
                        flightsA = sorted(squadrons[squadA])
                        flightsB = sorted(squadrons[squadB])
                        
                        # Create the pattern exactly like the reference
                        matches = [
                            (flightsA[0], flightsB[0]),
                            (flightsA[1], flightsB[1]),
                            (flightsA[2], flightsA[0]),  # This is the only same squadron matchup we allow
                            (flightsA[1], flightsB[0]),
                            (flightsA[2], flightsB[1])
                        ]
                    else:
                        # Fallback pattern with squadron check
                        # Try to create a valid schedule with each flight playing twice
                        # and different squadrons playing against each other
                        valid_matches = []
                        
                        # Find all possible pairs where squadrons are different
                        for i, flight1 in enumerate(flights):
                            for j, flight2 in enumerate(flights):
                                if i != j and flight1[0] != flight2[0]:
                                    valid_matches.append((flight1, flight2))
                        
                        if valid_matches:
                            # Ensure each flight plays exactly twice
                            flight_counts = {flight: 0 for flight in flights}
                            final_matches = []
                            
                            # Try to select 5 matches where each flight plays exactly twice
                            for match in valid_matches:
                                f1, f2 = match
                                if flight_counts[f1] < 2 and flight_counts[f2] < 2:
                                    final_matches.append(match)
                                    flight_counts[f1] += 1
                                    flight_counts[f2] += 1
                                    
                                    if len(final_matches) == 5 and all(count == 2 for flight, count in flight_counts.items()):
                                        matches = final_matches
                                        break
                            
                            # If we couldn't create a perfect schedule, use our fallback
                            if len(final_matches) < 5 or not all(count == 2 for flight, count in flight_counts.items()):
                                matches = [
                                    (flights[0], flights[1]),
                                    (flights[2], flights[3]),
                                    (flights[4], flights[0]),
                                    (flights[1], flights[2]),
                                    (flights[3], flights[4])
                                ]
                        else:
                            matches = [
                                (flights[0], flights[1]),
                                (flights[2], flights[3]),
                                (flights[4], flights[0]),
                                (flights[1], flights[2]),
                                (flights[3], flights[4])
                            ]
                else:
                    # Fallback pattern for mixed squadrons
                    # Try to create a valid schedule with each flight playing twice
                    # and different squadrons playing against each other
                    valid_matches = []
                    
                    # Find all possible pairs where squadrons are different
                    for i, flight1 in enumerate(flights):
                        for j, flight2 in enumerate(flights):
                            if i != j and flight1[0] != flight2[0]:
                                valid_matches.append((flight1, flight2))
                    
                    if valid_matches:
                        # Ensure each flight plays exactly twice
                        flight_counts = {flight: 0 for flight in flights}
                        final_matches = []
                        
                        # Try to select 5 matches where each flight plays exactly twice
                        for match in valid_matches:
                            f1, f2 = match
                            if flight_counts[f1] < 2 and flight_counts[f2] < 2:
                                final_matches.append(match)
                                flight_counts[f1] += 1
                                flight_counts[f2] += 1
                                
                                if len(final_matches) == 5 and all(count == 2 for flight, count in flight_counts.items()):
                                    matches = final_matches
                                    break
                        
                        # If we couldn't create a perfect schedule, use our fallback
                        if len(final_matches) < 5 or not all(count == 2 for flight, count in flight_counts.items()):
                            matches = [
                                (flights[0], flights[1]),
                                (flights[2], flights[3]),
                                (flights[4], flights[0]),
                                (flights[1], flights[2]),
                                (flights[3], flights[4])
                            ]
                    else:
                        matches = [
                            (flights[0], flights[1]),
                            (flights[2], flights[3]),
                            (flights[4], flights[0]),
                            (flights[1], flights[2]),
                            (flights[3], flights[4])
                        ]
                
                # Generate the schedule entries for these matches
                for flight1, flight2 in matches:
                    game_end = current_time + timedelta(minutes=20)
                    transition_end = game_end + timedelta(minutes=10)
                    
                    match = {
                        'field': field_num,
                        'match_number': match_number,
                        'time': f"{current_time.strftime('%H:%M')} - {game_end.strftime('%H:%M')}",
                        'transition': f"{game_end.strftime('%H:%M')} - {transition_end.strftime('%H:%M')}",
                        'flight1': flight1,
                        'flight2': flight2
                    }
                    
                    schedule.append(match)
                    match_number += 1
                    current_time = transition_end
                    
                    # Update tracking for all flights
                    all_games_played[flight1] += 1
                    all_games_played[flight2] += 1
                    all_played_against[flight1].add(flight2)
                    all_played_against[flight2].add(flight1)
            elif n == 4:  # 4 flights pattern
                # Create the pattern shown in the reference example:
                # A09 vs B24, A11 vs B27, A09 vs B27, A11 vs B24
                flights = field_flights.copy()
                flights.sort()  # Sort to make the pattern predictable
                
                # Group by squadron
                squadrons = {}
                for flight in flights:
                    squadron = flight[0]  # First character is the squadron
                    if squadron not in squadrons:
                        squadrons[squadron] = []
                    squadrons[squadron].append(flight)
                
                matches = []
                
                # If we have two squadrons with two flights each (like in reference example)
                if len(squadrons) == 2 and all(len(flights) == 2 for squadron, flights in squadrons.items()):
                    squad_keys = list(squadrons.keys())
                    squad1, squad2 = squad_keys[0], squad_keys[1]
                    flights1 = sorted(squadrons[squad1])
                    flights2 = sorted(squadrons[squad2])
                    
                    # Create the pattern exactly like the reference
                    matches = [
                        (flights1[0], flights2[0]),
                        (flights1[1], flights2[1]),
                        (flights1[0], flights2[1]),
                        (flights1[1], flights2[0])
                    ]
                else:
                    # For other cases, ensure different squadrons play against each other
                    valid_matches = []
                    
                    # Find all possible pairs where squadrons are different
                    for i, flight1 in enumerate(flights):
                        for j, flight2 in enumerate(flights):
                            if i != j and flight1[0] != flight2[0]:
                                valid_matches.append((flight1, flight2))
                    
                    if valid_matches:
                        # Ensure each flight plays exactly twice
                        flight_counts = {flight: 0 for flight in flights}
                        final_matches = []
                        
                        # Try to select 4 matches where each flight plays exactly twice
                        for match in valid_matches:
                            f1, f2 = match
                            if flight_counts[f1] < 2 and flight_counts[f2] < 2:
                                final_matches.append(match)
                                flight_counts[f1] += 1
                                flight_counts[f2] += 1
                                
                                if len(final_matches) == 4 and all(count == 2 for flight, count in flight_counts.items()):
                                    matches = final_matches
                                    break
                        
                        # If we couldn't create a perfect schedule, use a fallback
                        if len(final_matches) < 4 or not all(count == 2 for flight, count in flight_counts.items()):
                            # Try to create a round robin with minimal same-squadron matchups
                            matches = [
                                (flights[0], flights[1]),
                                (flights[2], flights[3]),
                                (flights[0], flights[2]),
                                (flights[1], flights[3])
                            ]
                    else:
                        # Fallback pattern if no valid matches
                        matches = [
                            (flights[0], flights[1]),
                            (flights[2], flights[3]),
                            (flights[0], flights[2]),
                            (flights[1], flights[3])
                        ]
                
                # Generate the schedule entries for these matches
                for flight1, flight2 in matches:
                    game_end = current_time + timedelta(minutes=20)
                    transition_end = game_end + timedelta(minutes=10)
                    
                    match = {
                        'field': field_num,
                        'match_number': match_number,
                        'time': f"{current_time.strftime('%H:%M')} - {game_end.strftime('%H:%M')}",
                        'transition': f"{game_end.strftime('%H:%M')} - {transition_end.strftime('%H:%M')}",
                        'flight1': flight1,
                        'flight2': flight2
                    }
                    
                    schedule.append(match)
                    match_number += 1
                    current_time = transition_end
                    
                    # Update tracking for all flights
                    all_games_played[flight1] += 1
                    all_games_played[flight2] += 1
                    all_played_against[flight1].add(flight2)
                    all_played_against[flight2].add(flight1)
        else:
            # Original scheduling logic or flexible scheduling for other cases
            # Track games played for flights in this field
            field_games_played = {flight: 0 for flight in field_flights}
            played_against = {flight: set() for flight in field_flights}

            # Backtracking function to schedule matches
            def backtrack():
                nonlocal current_time, match_number
                
                if all(games == 2 for games in field_games_played.values()):
                    return True

                # Get the last match for this field to check for back-to-back games
                last_match = next((m for m in reversed(schedule) if m['field'] == field_num), None)
                last_flights = {last_match['flight1'], last_match['flight2']} if last_match else set()

                # Group flights by experience level
                no_games = [f for f in field_flights if all_games_played[f] == 0 and field_games_played[f] < 2]
                one_game = [f for f in field_flights if all_games_played[f] == 1 and field_games_played[f] < 2]
                two_games = [f for f in field_flights if all_games_played[f] == 2 and field_games_played[f] < 2]

                # In flexible scheduling mode, prioritize good matches over strict squadron rules
                if flexible_scheduling:
                    # Try to match teams with same experience level without squadron restriction
                    for exp_group in [no_games, one_game, two_games]:
                        if len(exp_group) >= 2:
                            random.shuffle(exp_group)
                            for i, flight1 in enumerate(exp_group):
                                if flight1 in last_flights:
                                    continue
                                    
                                for flight2 in exp_group[i+1:]:
                                    if (flight2 not in last_flights and
                                        flight2 not in played_against[flight1] and
                                        flight1[0] != flight2[0] and  # Add squadron check
                                        (avoid_matchups is None or flight2 not in avoid_matchups.get(flight1, set()))):
                                        
                                        # Schedule the match - added squadron check (flight1[0] != flight2[0])
                                        field_games_played[flight1] += 1
                                        field_games_played[flight2] += 1
                                        all_games_played[flight1] += 1
                                        all_games_played[flight2] += 1
                                        played_against[flight1].add(flight2)
                                        played_against[flight2].add(flight1)
                                        all_played_against[flight1].add(flight2)
                                        all_played_against[flight2].add(flight1)

                                        game_end = current_time + timedelta(minutes=20)
                                        transition_end = game_end + timedelta(minutes=10)

                                        match = {
                                            'field': field_num,
                                            'match_number': match_number,
                                            'time': f"{current_time.strftime('%H:%M')} - {game_end.strftime('%H:%M')}",
                                            'transition': f"{game_end.strftime('%H:%M')} - {transition_end.strftime('%H:%M')}",
                                            'flight1': flight1,
                                            'flight2': flight2
                                        }

                                        schedule.append(match)
                                        match_number += 1
                                        current_time = transition_end

                                        # Recurse
                                        if backtrack():
                                            return True

                                        # Backtrack
                                        schedule.pop()
                                        match_number -= 1
                                        current_time = current_time - timedelta(minutes=30)
                                        field_games_played[flight1] -= 1
                                        field_games_played[flight2] -= 1
                                        all_games_played[flight1] -= 1
                                        all_games_played[flight2] -= 1
                                        played_against[flight1].remove(flight2)
                                        played_against[flight2].remove(flight1)
                                        all_played_against[flight1].remove(flight2)
                                        all_played_against[flight2].remove(flight1)
                else:
                    # Original scheduling logic with squadron restrictions
                    # Try to match teams with same experience level first
                    for exp_group in [no_games, one_game, two_games]:
                        if len(exp_group) >= 2:
                            random.shuffle(exp_group)
                            for i, flight1 in enumerate(exp_group):
                                if flight1 in last_flights:
                                    continue
                                    
                                for flight2 in exp_group[i+1:]:
                                    if (flight2 not in last_flights and
                                        flight2 not in played_against[flight1] and
                                        flight1[0] != flight2[0] and
                                        (avoid_matchups is None or flight2 not in avoid_matchups.get(flight1, set()))):
                                        
                                        # Schedule the match
                                        field_games_played[flight1] += 1
                                        field_games_played[flight2] += 1
                                        all_games_played[flight1] += 1
                                        all_games_played[flight2] += 1
                                        played_against[flight1].add(flight2)
                                        played_against[flight2].add(flight1)
                                        all_played_against[flight1].add(flight2)
                                        all_played_against[flight2].add(flight1)

                                        game_end = current_time + timedelta(minutes=20)
                                        transition_end = game_end + timedelta(minutes=10)

                                        match = {
                                            'field': field_num,
                                            'match_number': match_number,
                                            'time': f"{current_time.strftime('%H:%M')} - {game_end.strftime('%H:%M')}",
                                            'transition': f"{game_end.strftime('%H:%M')} - {transition_end.strftime('%H:%M')}",
                                            'flight1': flight1,
                                            'flight2': flight2
                                        }

                                        schedule.append(match)
                                        match_number += 1
                                        current_time = transition_end

                                        # Recurse
                                        if backtrack():
                                            return True

                                        # Backtrack
                                        schedule.pop()
                                        match_number -= 1
                                        current_time = current_time - timedelta(minutes=30)
                                        field_games_played[flight1] -= 1
                                        field_games_played[flight2] -= 1
                                        all_games_played[flight1] -= 1
                                        all_games_played[flight2] -= 1
                                        played_against[flight1].remove(flight2)
                                        played_against[flight2].remove(flight1)
                                        all_played_against[flight1].remove(flight2)
                                        all_played_against[flight2].remove(flight1)

                    # If we can't match within same experience level, try adjacent levels
                    # (but only if absolutely necessary and no other options exist)
                    if no_games and one_game:
                        # Only match no_games with one_game if we have no other choice
                        for flight1 in no_games:
                            if flight1 in last_flights:
                                continue
                                
                            for flight2 in one_game:
                                if (flight2 not in last_flights and
                                    flight2 not in played_against[flight1] and
                                    flight1[0] != flight2[0] and
                                    (avoid_matchups is None or flight2 not in avoid_matchups.get(flight1, set()))):
                                    
                                    # Schedule the match
                                    field_games_played[flight1] += 1
                                    field_games_played[flight2] += 1
                                    all_games_played[flight1] += 1
                                    all_games_played[flight2] += 1
                                    played_against[flight1].add(flight2)
                                    played_against[flight2].add(flight1)
                                    all_played_against[flight1].add(flight2)
                                    all_played_against[flight2].add(flight1)

                                    game_end = current_time + timedelta(minutes=20)
                                    transition_end = game_end + timedelta(minutes=10)

                                    match = {
                                        'field': field_num,
                                        'match_number': match_number,
                                        'time': f"{current_time.strftime('%H:%M')} - {game_end.strftime('%H:%M')}",
                                        'transition': f"{game_end.strftime('%H:%M')} - {transition_end.strftime('%H:%M')}",
                                        'flight1': flight1,
                                        'flight2': flight2
                                    }

                                    schedule.append(match)
                                    match_number += 1
                                    current_time = transition_end

                                    # Recurse
                                    if backtrack():
                                        return True

                                    # Backtrack
                                    schedule.pop()
                                    match_number -= 1
                                    current_time = current_time - timedelta(minutes=30)
                                    field_games_played[flight1] -= 1
                                    field_games_played[flight2] -= 1
                                    all_games_played[flight1] -= 1
                                    all_games_played[flight2] -= 1
                                    played_against[flight1].remove(flight2)
                                    played_against[flight2].remove(flight1)
                                    all_played_against[flight1].remove(flight2)
                                    all_played_against[flight2].remove(flight1)

                return False

            # Start backtracking
            backtrack()

    return schedule, fields

def create_5_flight_schedule(flights, squadrons):
    """Helper function to create a schedule for 5 flights with any squadron distribution."""
    # Create a schedule where each flight plays exactly 2 games
    matches = []
    
    # Try to minimize same-squadron matchups while ensuring each flight plays twice
    # We'll create a cyclic matching: 0-1, 1-2, 2-3, 3-4, 4-0
    matches.append((flights[0], flights[1]))
    matches.append((flights[1], flights[2]))
    matches.append((flights[2], flights[3]))
    matches.append((flights[3], flights[4]))
    matches.append((flights[4], flights[0]))
    
    return matches

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/submit', methods=['POST'])
def submit():
    # Store the initial setup data in session
    session['class_name'] = request.form.get('class_name')
    session['start_time'] = request.form.get('start_time')
    session['arrival_time'] = request.form.get('arrival_time')
    # Store the flexible scheduling setting
    session['flexible_scheduling'] = 'flexible_scheduling' in request.form
    return redirect(url_for('flight_selection'))

@app.route('/flight_selection')
def flight_selection():
    return render_template('flight_selection.html')

@app.route('/process_flights', methods=['POST'])
def process_flights():
    try:
        selected_classes = request.form.getlist('classes')
        num_fields = int(request.form.get('num_fields', 8))
        start_time = session.get('start_time')
        arrival_time = session.get('arrival_time')
        # Get the flexible scheduling setting from session
        flexible_scheduling = session.get('flexible_scheduling', False)
        
        # Process referee list
        referee_list = request.form.get('referee_list', '')
        referees = {}
        
        if referee_list:
            for line in referee_list.split('\n'):
                line = line.strip()
                if line:
                    # Split on tab or multiple spaces
                    parts = line.split('\t') if '\t' in line else line.split('  ', 1)
                    if len(parts) == 2:
                        flight = parts[0].strip()
                        name = parts[1].strip()
                        if flight in selected_classes:  # Only add if flight is selected
                            referees[flight] = name  # Store instructor name for each flight
        
        # Store referees in session
        session['referees'] = referees
        session['num_fields'] = num_fields
        
        if not selected_classes:
            return "Please select at least one class", 400
            
        if not start_time:
            return "Start time not found in session", 400
            
        if len(selected_classes) < 2:
            return "Please select at least two classes to create a schedule", 400
            
        # Pass the flexible scheduling setting to the generate_schedule function
        schedule, field_assignments = generate_schedule(selected_classes, start_time, num_fields, flexible_scheduling=flexible_scheduling)
        
        # Store schedule in session for download
        session['schedule'] = schedule
        
        return render_template('schedule.html', 
                             schedule=schedule, 
                             field_assignments=field_assignments,
                             class_name=session.get('class_name'),
                             start_time=start_time,
                             arrival_time=arrival_time,
                             referees=referees)  # Pass referees to template
                             
    except Exception as e:
        print(f"Error processing flights: {e}")
        return f"An error occurred: {str(e)}", 500

@app.route('/update_schedule', methods=['POST'])
def update_schedule():
    try:
        # Extract updated data from the form
        updated_flights = request.form.to_dict()
        print("Updated flights data:", updated_flights)
        
        # Process the updated data as needed
        # This is where you would update your schedule logic or database
        
        # Redirect back to the schedule page
        return redirect(url_for('process_flights'))
    except Exception as e:
        print(f"Error updating schedule: {e}")
        return f"An error occurred: {str(e)}", 500

@app.route('/save_schedule', methods=['POST'])
def save_schedule():
    if is_freezing():
        return '', 200
    try:
        # Get the updated schedule from the request
        updated_schedule = request.json.get('schedule', [])
        
        # Sort the schedule by field and match number
        updated_schedule.sort(key=lambda x: (x['field'], x['match_number']))
        
        # Determine if we're saving Flex A or B schedule based on the URL
        is_flex_b = 'flex_b' in request.referrer if request.referrer else False
        
        # Update the appropriate schedule in the session
        if is_flex_b:
            session['flex_b_schedule'] = updated_schedule
        else:
            session['schedule'] = updated_schedule
            
        # Store the current time as last_saved timestamp
        session['last_saved'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error saving schedule: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/download_schedule')
def download_schedule():
    if is_freezing():
        return '', 200
    try:
        # For static site generation, return a placeholder if no schedule exists
        if app.config.get('FREEZING'):
            return send_file(
                BytesIO(b'Placeholder for schedule download'),
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                as_attachment=True,
                download_name=f'placeholder_schedule.xlsx'
            )
            
        # Determine which schedule to download based on the URL
        is_flex_b = 'flex_b' in request.referrer if request.referrer else False
        
        # Get the appropriate schedule
        if is_flex_b:
            schedule = session.get('flex_b_schedule', [])
            start_time = session.get('flex_b_start_time', session.get('start_time'))
            arrival_time = session.get('arrival_time', '')
            class_name = session.get('class_name', 'Schedule') + " - Flex B"
        else:
            schedule = session.get('schedule', [])
            start_time = session.get('start_time', '')
            arrival_time = session.get('arrival_time', '')
            class_name = session.get('class_name', 'Schedule')
            
        if not schedule:
            return "No schedule found", 400
            
        # Create field_matches dictionary from schedule
        field_matches = {}
        for match in schedule:
            field_num = match['field']
            if field_num not in field_matches:
                field_matches[field_num] = []
            field_matches[field_num].append(match)
        
        # Create Excel file
        excel_buffer = BytesIO()
        workbook = xlsxwriter.Workbook(excel_buffer)
        
        # Define formats
        header_format = workbook.add_format({
            'bold': True,
            'bg_color': '#4A4A4A',
            'font_color': 'white',
            'align': 'center',
            'border': 1
        })

        info_header_format = workbook.add_format({
            'bold': True,
            'bg_color': '#af9b62',  # Gold color to match the app theme
            'font_color': '#1a2f5a',  # Dark blue text
            'align': 'left',
            'border': 1
        })

        info_value_format = workbook.add_format({
            'bg_color': 'white',
            'font_color': 'black',
            'align': 'left',
            'border': 1
        })

        # Squadron color formats
        knights_format = workbook.add_format({
            'bg_color': '#FFFFFF',  # White
            'font_color': '#FF0000',  # Bright Red
            'align': 'center',
            'border': 1
        })
        bulls_format = workbook.add_format({
            'bg_color': '#4B0F0F',  # Deep Maroon
            'font_color': '#FFA500',  # Orange
            'align': 'center',
            'border': 1
        })
        centurions_format = workbook.add_format({
            'bg_color': '#228B22',  # Marker Green
            'font_color': '#FFFF00',  # Yellow
            'align': 'center',
            'border': 1
        })
        tigers_format = workbook.add_format({
            'bg_color': '#E65100',  # Deep Orange
            'font_color': '#000000',  # Black
            'align': 'center',
            'border': 1
        })

        # Field color formats (light pastel colors)
        field_formats = [
            workbook.add_format({
                'bg_color': color,
                'align': 'center',
                'border': 1
            }) for color in [
                '#F0F7FF',  # Light Blue
                '#FFF0F0',  # Light Red
                '#F0FFF0',  # Light Green
                '#FFF7F0',  # Light Orange
                '#F0F0FF',  # Light Purple
                '#FFFFF0',  # Light Yellow
                '#FFF0FF',  # Light Pink
                '#F0FFFF',  # Light Cyan
            ]
        ]

        # Regular cell format
        cell_format = workbook.add_format({
            'align': 'center',
            'border': 1
        })

        # Set column widths
        worksheet = workbook.add_worksheet('Schedule')
        worksheet.set_column('A:A', 20)  # Field/Info
        worksheet.set_column('B:B', 20)  # Match/Value
        worksheet.set_column('C:C', 20)  # Time
        worksheet.set_column('D:D', 20)  # Transition
        worksheet.set_column('E:E', 12)  # Flight 1
        worksheet.set_column('F:F', 12)  # Flight 2

        # Write schedule info (class name, arrival time, start time)
        worksheet.write(0, 0, 'Class Name:', info_header_format)
        worksheet.write(0, 1, class_name, info_value_format)
        
        # Convert time to 12-hour format if it has a valid format
        def format_time_12hr(time_str):
            if not time_str:
                return ''
            try:
                # Parse the time string as 24-hour format
                hour, minute = time_str.split(':')
                hour = int(hour)
                # Convert to 12-hour format
                hour_12 = hour % 12
                if hour_12 == 0:
                    hour_12 = 12
                # Add AM/PM
                suffix = 'PM' if hour >= 12 else 'AM'
                return f"{hour_12:02d}:{minute} {suffix}"
            except:
                return time_str
        
        # Write arrival and start times in 12-hour format
        worksheet.write(1, 0, 'Arrival Time:', info_header_format)
        worksheet.write(1, 1, format_time_12hr(arrival_time), info_value_format)
        
        worksheet.write(2, 0, 'Start Time:', info_header_format)
        worksheet.write(2, 1, format_time_12hr(start_time), info_value_format)
        
        # Add a separator row
        worksheet.write(3, 0, '', workbook.add_format({'bg_color': '#E0E0E0'}))
        worksheet.write(3, 1, '', workbook.add_format({'bg_color': '#E0E0E0'}))
        worksheet.write(3, 2, '', workbook.add_format({'bg_color': '#E0E0E0'}))
        worksheet.write(3, 3, '', workbook.add_format({'bg_color': '#E0E0E0'}))
        worksheet.write(3, 4, '', workbook.add_format({'bg_color': '#E0E0E0'}))
        worksheet.write(3, 5, '', workbook.add_format({'bg_color': '#E0E0E0'}))

        # Write schedule headers (starting from row 4)
        headers = ['Field', 'Match', 'Time', 'Transition', 'Flight 1', 'Flight 2']
        for col, header in enumerate(headers):
            worksheet.write(4, col, header, header_format)

        # Sort matches by field and match number
        sorted_matches = sorted(schedule, key=lambda x: (x['field'], x['match_number']))

        # Write schedule data (starting from row 5)
        current_row = 5
        current_field = None
        for match in sorted_matches:
            # Get the field format (subtract 1 for 0-based index)
            field_format = field_formats[(match['field'] - 1) % len(field_formats)]
            
            # Write field number and match number with field color
            worksheet.write(current_row, 0, match['field'], field_format)
            worksheet.write(current_row, 1, match['match_number'], field_format)
            worksheet.write(current_row, 2, match['time'], field_format)
            worksheet.write(current_row, 3, match['transition'], field_format)

            # Apply squadron-specific formatting for Flight 1
            flight1_format = workbook.add_format({
                'bg_color': '#FFFFFF' if match['flight1'].startswith('A') else
                           '#4B0F0F' if match['flight1'].startswith('B') else
                           '#228B22' if match['flight1'].startswith('C') else
                           '#E65100' if match['flight1'].startswith('F') else
                           'white',
                'font_color': '#FF0000' if match['flight1'].startswith('A') else
                             '#FFA500' if match['flight1'].startswith('B') else
                             '#FFFF00' if match['flight1'].startswith('C') else
                             '#000000' if match['flight1'].startswith('F') else
                             'black',
                'align': 'center',
                'border': 1
            })
            worksheet.write(current_row, 4, match['flight1'], flight1_format)

            # Apply squadron-specific formatting for Flight 2
            flight2_format = workbook.add_format({
                'bg_color': '#FFFFFF' if match['flight2'].startswith('A') else
                           '#4B0F0F' if match['flight2'].startswith('B') else
                           '#228B22' if match['flight2'].startswith('C') else
                           '#E65100' if match['flight2'].startswith('F') else
                           'white',
                'font_color': '#FF0000' if match['flight2'].startswith('A') else
                             '#FFA500' if match['flight2'].startswith('B') else
                             '#FFFF00' if match['flight2'].startswith('C') else
                             '#000000' if match['flight2'].startswith('F') else
                             'black',
                'align': 'center',
                'border': 1
            })
            worksheet.write(current_row, 5, match['flight2'], flight2_format)

            current_row += 1

        # Add a legend for fields
        legend_row = current_row + 1
        worksheet.write(legend_row, 0, 'Legend:', workbook.add_format({'bold': True}))
        
        # Squadron legend
        worksheet.write(legend_row + 1, 0, 'Squadrons:', workbook.add_format({'bold': True}))
        worksheet.write(legend_row + 1, 1, 'Knights (A)', knights_format)
        worksheet.write(legend_row + 1, 2, 'Bulls (B)', bulls_format)
        worksheet.write(legend_row + 1, 3, 'Centurions (C)', centurions_format)
        worksheet.write(legend_row + 1, 4, 'Tigers (F)', tigers_format)
        
        # Field legend
        worksheet.write(legend_row + 2, 0, 'Fields:', workbook.add_format({'bold': True}))
        for i, format in enumerate(field_formats):
            worksheet.write(legend_row + 2, i + 1, f'Field {i + 1}', format)

        # Add Referee worksheet
        referee_sheet = workbook.add_worksheet('Referees')
        
        # Format for referee sheet headers
        referee_header_format = workbook.add_format({
            'bold': True,
            'bg_color': '#1a2f5a',
            'font_color': 'white',
            'align': 'center',
            'border': 1
        })

        # Format for referee entries (regular)
        referee_entry_format = workbook.add_format({
            'align': 'left',
            'border': 1,
            'bg_color': '#f5f5f5'
        })

        # Format for head referee entries (highlighted)
        head_referee_format = workbook.add_format({
            'align': 'left',
            'border': 1,
            'bg_color': '#af9b62',  # Gold color to match the app theme
            'font_color': '#1a2f5a',  # Dark blue text
            'bold': True
        })

        # Set column widths
        referee_sheet.set_column('A:A', 15)  # Field number
        referee_sheet.set_column('B:B', 40)  # Referee name
        referee_sheet.set_column('C:C', 15)  # Flight
        referee_sheet.set_column('D:D', 15)  # Head Referee status

        # Write headers
        referee_sheet.write(0, 0, 'Field', referee_header_format)
        referee_sheet.write(0, 1, 'Referee', referee_header_format)
        referee_sheet.write(0, 2, 'Flight', referee_header_format)
        referee_sheet.write(0, 3, 'Head Referee', referee_header_format)

        # Get head referee data from session - now keyed by referee name
        head_referees = session.get('head_referees', {})

        # Write referee data
        current_row = 1
        for field_num in sorted(field_matches.keys()):
            field_flights = set()
            for match in field_matches[field_num]:
                field_flights.add(match['flight1'])
                field_flights.add(match['flight2'])
            
            for flight in sorted(field_flights):
                if flight in session.get('referees', {}):
                    referee_name = session.get('referees', {})[flight]
                    # Check if this referee is a head referee by their name
                    is_head = head_referees.get(referee_name, False)
                    
                    # Use appropriate format based on head referee status
                    current_format = head_referee_format if is_head else referee_entry_format
                    
                    referee_sheet.write(current_row, 0, f'Field {field_num}', current_format)
                    referee_sheet.write(current_row, 1, referee_name, current_format)
                    referee_sheet.write(current_row, 2, flight, current_format)
                    referee_sheet.write(current_row, 3, "Yes" if is_head else "No", current_format)
                    
                    current_row += 1

        # Add Manual Referees worksheet
        manual_sheet = workbook.add_worksheet('Manual Referees')
        
        # Use the same formats as the referee sheet
        manual_sheet.set_column('A:A', 15)  # Field number
        manual_sheet.set_column('B:B', 40)  # Referee name
        manual_sheet.set_column('C:C', 15)  # Head Referee status
        manual_sheet.set_column('D:D', 15)  # Lead Referee status

        # Write headers
        manual_sheet.write(0, 0, 'Field', referee_header_format)
        manual_sheet.write(0, 1, 'Referee', referee_header_format)
        manual_sheet.write(0, 2, 'Head Referee', referee_header_format)
        manual_sheet.write(0, 3, 'Lead Referee', referee_header_format)

        # Get unassigned referees from session and sort by field number
        unassigned_referees = session.get('unassigned_referees', {})
        sorted_referees = sorted(
            [(name, data) for name, data in unassigned_referees.items()],
            key=lambda x: int(x[1]['field'])  # Convert field to int for sorting
        )
        
        # Write manual referee data
        current_row = 1
        for referee_name, data in sorted_referees:
            field_num = int(data.get('field', 0))  # Convert to int with default 0
            is_head = data.get('is_head', False)
            is_lead = data.get('is_lead', False)
            
            # Use appropriate format based on head referee status
            current_format = head_referee_format if is_head else referee_entry_format
            
            manual_sheet.write(current_row, 0, f'Field {field_num}', current_format)
            manual_sheet.write(current_row, 1, referee_name, current_format)
            manual_sheet.write(current_row, 2, "Yes" if is_head else "No", current_format)
            manual_sheet.write(current_row, 3, "Yes" if is_lead else "No", current_format)
            
            current_row += 1

        workbook.close()
        excel_buffer.seek(0)

        # Return Excel file directly (no ZIP needed)
        return send_file(
            excel_buffer,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'{class_name.replace(" ", "_")}_schedule.xlsx'
        )
        
    except Exception as e:
        print(f"Error downloading schedule: {e}")
        return f"An error occurred: {str(e)}", 500

@app.route('/schedule_flex_b')
def schedule_flex_b():
    try:
        # Check if we're freezing
        if app.config.get('FREEZING'):
            mock_data = app.config['MOCK_SESSION_DATA']
            return render_template('schedule.html',
                                schedule=[],
                                field_assignments=[[] for _ in range(mock_data['num_fields'])],
                                class_name=mock_data['class_name'] + " - Flex B",
                                start_time=mock_data['start_time'],
                                arrival_time=mock_data['arrival_time'],
                                referees=mock_data['referees'])

        # First check if we already have a Flex B schedule
        flex_b_schedule = session.get('flex_b_schedule')
        if flex_b_schedule:
            # Get the stored number of fields from session
            num_fields = session.get('num_fields', 8)
            
            # Get field assignments from existing Flex B schedule
            field_assignments = [[] for _ in range(num_fields)]
            for match in flex_b_schedule:
                field = match['field'] - 1  # Convert to 0-based index
                if match['flight1'] not in field_assignments[field]:
                    field_assignments[field].append(match['flight1'])
                if match['flight2'] not in field_assignments[field]:
                    field_assignments[field].append(match['flight2'])
            
            # Clear manual referees when viewing Flex B
            session['unassigned_referees'] = {}
            
            return render_template('schedule.html', 
                                 schedule=flex_b_schedule,
                                 field_assignments=field_assignments,
                                 class_name=session.get('class_name') + " - Flex B",
                                 start_time=session.get('flex_b_start_time', session.get('start_time')),
                                 arrival_time=session.get('arrival_time'),
                                 referees=session.get('referees', {}))
        else:
            # Get the original schedule and field assignments
            schedule = session.get('schedule')
            if not schedule:
                return "No Flex A schedule found to base Flex B on", 400
                
            # Clear manual referees when generating new Flex B
            session['unassigned_referees'] = {}
            
            # If no Flex B schedule exists, create a new one
            original_schedule = session.get('schedule', [])
            selected_classes = set()
            for match in original_schedule:
                selected_classes.add(match['flight1'])
                selected_classes.add(match['flight2'])
            
            if not selected_classes:
                return "No previous schedule found", 400
                
            # Convert set back to list
            selected_classes = list(selected_classes)
            
            # Get the start time and number of fields from session
            start_time = session.get('flex_b_start_time', session.get('start_time'))
            num_fields = session.get('num_fields', 8)  # Use stored number of fields
            
            # Create a mapping of which field each flight was in for Flex A
            flex_a_fields = {}
            for match in original_schedule:
                flex_a_fields[match['flight1']] = match['field']
                flex_a_fields[match['flight2']] = match['field']
            
            # Generate new schedule with flights in different fields
            def generate_flex_b_schedule(selected_classes, start_time, num_fields):
                # Create a list of fields that each flight can't be assigned to (their Flex A field)
                avoid_fields = {flight: flex_a_fields.get(flight) for flight in selected_classes}
                
                # Shuffle the flights
                shuffled_flights = selected_classes.copy()
                random.shuffle(shuffled_flights)
                
                # Distribute flights to new fields
                fields = [[] for _ in range(num_fields)]
                
                # First pass: try to place each flight in a field different from their Flex A field
                for flight in shuffled_flights:
                    avoid_field = avoid_fields[flight] - 1  # Convert to 0-based index
                    possible_fields = [i for i in range(num_fields) if i != avoid_field]
                    random.shuffle(possible_fields)
                    
                    # Try to find a field with no squadron conflict
                    placed = False
                    for field_idx in possible_fields:
                        squadron_in_field = {f[0] for f in fields[field_idx]}
                        if flight[0] not in squadron_in_field:
                            fields[field_idx].append(flight)
                            placed = True
                            break
                    
                    # If no field without squadron conflict, place in least populated valid field
                    if not placed:
                        field_idx = min(possible_fields, key=lambda i: len(fields[i]))
                        fields[field_idx].append(flight)
                
                # Generate schedule using the new field assignments
                schedule, _ = generate_schedule(selected_classes, start_time, num_fields, flexible_scheduling=True, custom_fields=fields)
                return schedule, fields
            
            # Generate Flex B schedule
            schedule, field_assignments = generate_flex_b_schedule(selected_classes, start_time, num_fields)
            
            # Store the new schedule in session
            session['flex_b_schedule'] = schedule
            
            return render_template('schedule.html', 
                                 schedule=schedule, 
                                 field_assignments=field_assignments,
                                 class_name=session.get('class_name') + " - Flex B",
                                 start_time=start_time,
                                 arrival_time=session.get('arrival_time'),
                                 referees=session.get('referees', {}))
                             
    except Exception as e:
        print(f"Error generating Flex B schedule: {e}")
        return f"An error occurred: {str(e)}", 500

@app.route('/view_flex_a')
def view_flex_a():
    try:
        # Check if we're freezing
        if app.config.get('FREEZING'):
            mock_data = app.config['MOCK_SESSION_DATA']
            return render_template('schedule.html',
                                schedule=[],
                                field_assignments=[[] for _ in range(mock_data['num_fields'])],
                                class_name=mock_data['class_name'],
                                start_time=mock_data['start_time'],
                                arrival_time=mock_data['arrival_time'],
                                referees=mock_data['referees'])

        # Get the original schedule from session
        schedule = session.get('schedule', [])
        if not schedule:
            return "No Flex A schedule found", 400
            
        # Get field assignments from the schedule
        field_assignments = [[] for _ in range(max(match['field'] for match in schedule))]
        for match in schedule:
            field = match['field'] - 1  # Convert to 0-based index
            if match['flight1'] not in field_assignments[field]:
                field_assignments[field].append(match['flight1'])
            if match['flight2'] not in field_assignments[field]:
                field_assignments[field].append(match['flight2'])
        
        return render_template('schedule.html', 
                             schedule=schedule, 
                             field_assignments=field_assignments,
                             class_name=session.get('class_name').replace(" - Flex B", ""),
                             start_time=session.get('start_time'),
                             arrival_time=session.get('arrival_time'),
                             referees=session.get('referees', {}))
                             
    except Exception as e:
        print(f"Error returning to Flex A schedule: {e}")
        return f"An error occurred: {str(e)}", 500

@app.route('/adjust_start_time', methods=['POST'])
def adjust_start_time():
    if is_freezing():
        return '', 200
    try:
        data = request.json
        new_time = data.get('new_time')
        is_flex_b = data.get('is_flex_b', False)
        preserve_matchups = data.get('preserve_matchups', False)
        
        # Store the new start time but don't regenerate schedule
        if is_flex_b:
            session['flex_b_start_time'] = new_time
        else:
            session['start_time'] = new_time
            
        # If preserving matchups, we're done - no need to regenerate the schedule
        if preserve_matchups:
            return jsonify({'success': True})
            
        # Otherwise, regenerate the schedule with the new start time
        # (code for regenerating would go here, but not needed for this feature)
            
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error adjusting start time: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/adjust_arrival_time', methods=['POST'])
def adjust_arrival_time():
    if is_freezing():
        return '', 200
    try:
        data = request.json
        new_time = data.get('new_time')
        is_flex_b = data.get('is_flex_b', False)
        
        # Store the new arrival time
        session['arrival_time'] = new_time
            
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error adjusting arrival time: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/upload_schedule', methods=['POST'])
def upload_schedule():
    if is_freezing():
        return '', 200
    try:
        if 'schedule_file' not in request.files:
            return "No file uploaded", 400
            
        file = request.files['schedule_file']
        schedule_type = request.form.get('schedule_type', 'flex_a')
        
        if file.filename == '':
            return "No file selected", 400
            
        if not file.filename.endswith('.xlsx'):
            return "Invalid file format. Please upload an Excel (.xlsx) file", 400
            
        # Read both sheets from the Excel file
        schedule_df = pd.read_excel(file, sheet_name='Schedule')
        
        try:
            referee_df = pd.read_excel(file, sheet_name='Referees')
            manual_referee_df = pd.read_excel(file, sheet_name='Manual Referees')
        except:
            referee_df = pd.DataFrame()
            manual_referee_df = pd.DataFrame()
        
        # Extract schedule info (class name, arrival time, start time) if present
        arrival_time = ''
        start_time = ''
        
        # Try to extract arrival time and start time from the first rows
        for i, row in schedule_df.iterrows():
            if i >= 5:  # Skip looking for info after the first 5 rows
                break
                
            # Look for arrival time and start time in the first column
            if isinstance(row[0], str) and 'arrival time' in row[0].lower() and pd.notna(row[1]):
                arrival_time_str = str(row[1])
                # Extract time part if in 12-hour format with AM/PM
                if 'AM' in arrival_time_str or 'PM' in arrival_time_str:
                    parts = arrival_time_str.split()
                    if len(parts) == 2:  # Format like "09:00 AM"
                        time_part = parts[0]
                        meridian = parts[1].upper()
                        
                        # Convert to 24-hour format
                        try:
                            hour, minute = map(int, time_part.split(':'))
                            if meridian == 'PM' and hour < 12:
                                hour += 12
                            elif meridian == 'AM' and hour == 12:
                                hour = 0
                            arrival_time = f"{hour:02d}:{minute:02d}"
                        except:
                            arrival_time = time_part
                    else:
                        arrival_time = arrival_time_str
                else:
                    arrival_time = arrival_time_str
                    
            if isinstance(row[0], str) and 'start time' in row[0].lower() and pd.notna(row[1]):
                start_time_str = str(row[1])
                # Extract time part if in 12-hour format with AM/PM
                if 'AM' in start_time_str or 'PM' in start_time_str:
                    parts = start_time_str.split()
                    if len(parts) == 2:  # Format like "09:00 AM"
                        time_part = parts[0]
                        meridian = parts[1].upper()
                        
                        # Convert to 24-hour format
                        try:
                            hour, minute = map(int, time_part.split(':'))
                            if meridian == 'PM' and hour < 12:
                                hour += 12
                            elif meridian == 'AM' and hour == 12:
                                hour = 0
                            start_time = f"{hour:02d}:{minute:02d}"
                        except:
                            start_time = time_part
                    else:
                        start_time = start_time_str
                else:
                    start_time = start_time_str
        
        # Skip info/header rows if they exist
        schedule_data_start = 0
        for i, row in schedule_df.iterrows():
            if isinstance(row[0], str) and row[0].lower() in ['field', 'match']:
                schedule_data_start = i + 1
                break
                
        # Convert Schedule DataFrame to schedule format
        schedule = []
        for i, row in schedule_df.iterrows():
            # Skip header and info rows
            if i < schedule_data_start:
                continue
                
            # Skip legend rows if they exist
            if pd.isna(row[0]) or (isinstance(row[0], str) and row[0].startswith('Legend')):
                continue
                
            try:
                match = {
                    'field': int(float(row[0])),
                    'match_number': int(float(row[1])),
                    'time': str(row[2]),
                    'transition': str(row[3]),
                    'flight1': str(row[4]).strip(),
                    'flight2': str(row[5]).strip()
                }
                if all(match.values()):
                    schedule.append(match)
            except (ValueError, TypeError, IndexError):
                continue
            
        if not schedule:
            return "No valid schedule data found in file", 400
            
        # Process referee data from Referees sheet
        referees = {}
        head_referees = {}
        
        if not referee_df.empty:
            for _, row in referee_df.iterrows():
                try:
                    flight = str(row['Flight']).strip()
                    referee_name = str(row['Referee']).strip()
                    field_num = str(row['Field']).replace('Field ', '') if 'Field' in str(row['Field']) else row['Field']
                    is_head = str(row['Head Referee']).strip().upper() == 'YES'
                    
                    if flight and referee_name:
                        referees[flight] = referee_name
                        if is_head:
                            head_referees[referee_name] = True
                except (ValueError, TypeError, AttributeError):
                    continue

        # Process manual referees from Manual Referees sheet
        unassigned_referees = {}
        
        if not manual_referee_df.empty:
            for _, row in manual_referee_df.iterrows():
                try:
                    referee_name = str(row['Referee']).strip()
                    
                    # Handle different field formats (Field 1, 1, etc.)
                    field_str = str(row['Field'])
                    if 'Field' in field_str:
                        field_num = int(field_str.replace('Field ', ''))
                    else:
                        field_num = int(float(field_str))
                    
                    is_head = str(row['Head Referee']).strip().upper() == 'YES'
                    is_lead = str(row.get('Lead Referee', 'NO')).strip().upper() == 'YES'
                    
                    if referee_name:
                        unassigned_referees[referee_name] = {
                            'field': field_num,
                            'is_head': is_head,
                            'is_lead': is_lead
                        }
                        if is_head:
                            head_referees[referee_name] = True
                except (ValueError, TypeError, AttributeError) as e:
                    print(f"Error processing manual referee row: {e}")
                    continue
            
        # Create field assignments
        num_fields = max(match['field'] for match in schedule)
        field_assignments = [[] for _ in range(num_fields)]
        for match in schedule:
            field = match['field'] - 1
            if match['flight1'] not in field_assignments[field]:
                field_assignments[field].append(match['flight1'])
            if match['flight2'] not in field_assignments[field]:
                field_assignments[field].append(match['flight2'])
        
        # Store everything in session based on schedule type
        if schedule:
            first_match_time = schedule[0]['time'].split(' - ')[0]
            
            # Calculate default arrival time (30 minutes before the first match)
            first_match_dt = datetime.strptime(first_match_time, '%H:%M')
            arrival_dt = first_match_dt - timedelta(minutes=30)
            arrival_time = arrival_dt.strftime('%H:%M')
            
            if schedule_type == 'flex_b':
                session['flex_b_schedule'] = schedule
                session['flex_b_start_time'] = first_match_time
                session['class_name'] = "Uploaded Schedule"
                # Set arrival time if not already set
                if 'arrival_time' not in session:
                    session['arrival_time'] = arrival_time
                return redirect(url_for('schedule_flex_b'))
            else:
                session['schedule'] = schedule
                session['start_time'] = first_match_time
                session['class_name'] = "Uploaded Schedule"
                # Set arrival time if not already set
                if 'arrival_time' not in session:
                    session['arrival_time'] = arrival_time
            
        session['referees'] = referees
        session['head_referees'] = head_referees
        session['unassigned_referees'] = unassigned_referees
        session['num_fields'] = num_fields
        
        # Redirect based on schedule type
        if schedule_type == 'flex_b':
            if start_time:
                session['flex_b_start_time'] = start_time
            if arrival_time:
                session['arrival_time'] = arrival_time
            return redirect(url_for('schedule_flex_b'))
        else:
            if start_time:
                session['start_time'] = start_time
            if arrival_time:
                session['arrival_time'] = arrival_time
        return redirect(url_for('view_flex_a'))
                             
    except Exception as e:
        print(f"Error uploading schedule: {str(e)}")
        return f"Error uploading schedule: {str(e)}", 500

@app.route('/update_head_referee', methods=['POST'])
def update_head_referee():
    if is_freezing():
        return '', 200
    try:
        data = request.get_json()
        field = data.get('field')
        flight = data.get('flight')
        is_head = data.get('isHead')
        
        # Initialize head_referees in session if it doesn't exist
        if 'head_referees' not in session:
            session['head_referees'] = {}
        
        # Get the referee name for this flight
        referee_name = session.get('referees', {}).get(flight)
        if not referee_name:
            return jsonify({'success': False, 'error': 'Referee not found'}), 400
            
        # Store the head referee status using referee name as key
        head_referees = session['head_referees']
        
        if is_head:
            head_referees[referee_name] = True
        else:
            head_referees.pop(referee_name, None)
            
        session['head_referees'] = head_referees
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error updating head referee: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/update_referee', methods=['POST'])
def update_referee():
    if is_freezing():
        return '', 200
    try:
        data = request.get_json()
        name = data.get('name')
        field = data.get('field')
        is_head = data.get('isHead')
        is_lead = data.get('isLead')
        
        # Initialize unassigned_referees in session if it doesn't exist
        if 'unassigned_referees' not in session:
            session['unassigned_referees'] = {}
            
        # Store the referee with their field and referee statuses
        session['unassigned_referees'][name] = {
            'field': field,
            'is_head': is_head,
            'is_lead': is_lead
        }
        
        # Update head referee status if needed
        if is_head:
            if 'head_referees' not in session:
                session['head_referees'] = {}
            session['head_referees'][name] = True
        
        session.modified = True
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error updating referee: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/delete_referee', methods=['POST'])
def delete_referee():
    if is_freezing():
        return '', 200
    try:
        data = request.get_json()
        field = data.get('field')
        flight = data.get('flight')  # For flight-assigned referees
        name = data.get('name')      # For manually added referees
        is_manual = data.get('isManual', False)
        
        if is_manual:
            # Remove from unassigned_referees
            if 'unassigned_referees' in session and name in session['unassigned_referees']:
                del session['unassigned_referees'][name]
                
                # Remove from head_referees if they were one
                if 'head_referees' in session and name in session['head_referees']:
                    del session['head_referees'][name]
        else:
            # Handle flight-assigned referee deletion
            referee_name = session.get('referees', {}).get(flight)
            if 'referees' in session and flight in session['referees']:
                del session['referees'][flight]
            
            # Remove from head_referees if they were one
            if referee_name and 'head_referees' in session and referee_name in session['head_referees']:
                del session['head_referees'][referee_name]
            
        session.modified = True
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error deleting referee: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/regenerate_schedule', methods=['POST'])
def regenerate_schedule():
    if is_freezing():
        return '', 200
    try:
        # Get the schedule type from the request
        is_flex_b = request.args.get('flex_b', 'false') == 'true'
        
        # Get stored parameters from session
        selected_classes = set()
        current_schedule = session.get('flex_b_schedule' if is_flex_b else 'schedule', [])
        
        # Extract unique flights from current schedule
        for match in current_schedule:
            selected_classes.add(match['flight1'])
            selected_classes.add(match['flight2'])
            
        selected_classes = list(selected_classes)
        # Get start time from current schedule if not in session
        start_time = session.get('flex_b_start_time' if is_flex_b else 'start_time')
        if not start_time and current_schedule:
            # Extract start time from first match
            first_match_time = current_schedule[0]['time'].split(' - ')[0]
            start_time = first_match_time
            # Store it in session
            if is_flex_b:
                session['flex_b_start_time'] = start_time
            else:
                session['start_time'] = start_time

        if not start_time:
            return "Error: No start time found", 400

        num_fields = session.get('num_fields', 8)
        # Get the flexible scheduling setting from session
        flexible_scheduling = session.get('flexible_scheduling', False)
        
        # Generate new schedule
        if is_flex_b:
            # Get the original schedule and field assignments
            original_schedule = session.get('schedule', [])
            
            # Create a mapping of which field each flight was in for Flex A
            flex_a_fields = {}
            for match in original_schedule:
                flex_a_fields[match['flight1']] = match['field']
                flex_a_fields[match['flight2']] = match['field']
            
            # Generate new schedule with flights in different fields
            def generate_flex_b_schedule(selected_classes, start_time, num_fields):
                # Create a list of fields that each flight can't be assigned to (their Flex A field)
                avoid_fields = {flight: flex_a_fields.get(flight) for flight in selected_classes}
                
                # Shuffle the flights
                shuffled_flights = selected_classes.copy()
                random.shuffle(shuffled_flights)
                
                # Distribute flights to new fields
                fields = [[] for _ in range(num_fields)]
                
                # First pass: try to place each flight in a field different from their Flex A field
                for flight in shuffled_flights:
                    avoid_field = avoid_fields[flight] - 1  # Convert to 0-based index
                    possible_fields = [i for i in range(num_fields) if i != avoid_field]
                    random.shuffle(possible_fields)
                    
                    # Try to find a field with no squadron conflict
                    placed = False
                    for field_idx in possible_fields:
                        squadron_in_field = {f[0] for f in fields[field_idx]}
                        if flight[0] not in squadron_in_field:
                            fields[field_idx].append(flight)
                            placed = True
                            break
                    
                    # If no field without squadron conflict, place in least populated valid field
                    if not placed:
                        field_idx = min(possible_fields, key=lambda i: len(fields[i]))
                        fields[field_idx].append(flight)
                
                # Generate schedule using the new field assignments
                schedule, _ = generate_schedule(selected_classes, start_time, num_fields, flexible_scheduling=True, custom_fields=fields)
                return schedule, fields
            
            # Generate Flex B schedule
            schedule, field_assignments = generate_flex_b_schedule(selected_classes, start_time, num_fields)
            
            session['flex_b_schedule'] = schedule
        else:
            schedule, field_assignments = generate_schedule(
                selected_classes,
                start_time,
                num_fields,
                flexible_scheduling=flexible_scheduling
            )
            session['schedule'] = schedule
            
        return redirect(url_for('schedule_flex_b' if is_flex_b else 'view_flex_a'))
        
    except Exception as e:
        print(f"Error regenerating schedule: {e}")
        return f"An error occurred: {str(e)}", 500

if __name__ == '__main__':
    app.run(debug=True) 