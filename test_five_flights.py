from app import generate_schedule

def check_back_to_back(schedule):
    """Check if any flight plays back-to-back games."""
    matches_by_field = {}
    
    # Group matches by field
    for match in schedule:
        field_num = match["field"]
        if field_num not in matches_by_field:
            matches_by_field[field_num] = []
        matches_by_field[field_num].append(match)
    
    # Check each field for back-to-back games
    back_to_back_issues = []
    for field_num, field_matches in matches_by_field.items():
        # Sort matches by match number
        field_matches.sort(key=lambda m: m["match_number"])
        
        # Check consecutive matches
        for i in range(len(field_matches) - 1):
            curr_match = field_matches[i]
            next_match = field_matches[i + 1]
            
            # Get flights in current and next match
            curr_flights = {curr_match["flight1"], curr_match["flight2"]}
            next_flights = {next_match["flight1"], next_match["flight2"]}
            
            # Check if any flight plays in both matches
            common_flights = curr_flights.intersection(next_flights)
            if common_flights:
                back_to_back_issues.append(
                    f"Field {field_num}: Flight(s) {', '.join(common_flights)} play back-to-back in matches {i+1} and {i+2}"
                )
    
    return back_to_back_issues

# Test the exact reference case: A07, A08, A15, B22, B23
print("TEST WITH REFERENCE FLIGHTS (1 field)")
schedule, fields = generate_schedule(['A07', 'A08', 'A15', 'B22', 'B23'], '08:00', 1, flexible_scheduling=True)
print('FIELD 1 FLIGHTS:')
print(fields[0])
print('\nSCHEDULE:')
for match in schedule:
    print(f'Field {match["field"]}, Match {match["match_number"]}: {match["flight1"]} vs {match["flight2"]}')

# Count games per flight
flights = {}
for match in schedule:
    f1 = match["flight1"]
    f2 = match["flight2"]
    if f1 not in flights:
        flights[f1] = 0
    if f2 not in flights:
        flights[f2] = 0
    flights[f1] += 1
    flights[f2] += 1

print("\nGAMES PER FLIGHT:")
for flight, count in flights.items():
    print(f"{flight}: {count} games")

# Check for back-to-back games
back_to_back_issues = check_back_to_back(schedule)
if back_to_back_issues:
    print("\nBACK-TO-BACK GAMES DETECTED:")
    for issue in back_to_back_issues:
        print(f"- {issue}")
else:
    print("\nNo back-to-back games detected.")

# Check if the matchups match our reference exactly
reference_matchups = [
    {'flight1': 'A07', 'flight2': 'B22'},
    {'flight1': 'A08', 'flight2': 'B23'},
    {'flight1': 'A15', 'flight2': 'B22'},
    {'flight1': 'A08', 'flight2': 'B23'},
    {'flight1': 'A07', 'flight2': 'B22'}
]

print("\nCHECKING AGAINST REFERENCE PATTERN:")
schedule_matches = [{k: match[k] for k in ['flight1', 'flight2']} for match in schedule]

# Sort both lists to compare
for i, (actual, expected) in enumerate(zip(sorted(schedule_matches, key=lambda m: m['flight1']), 
                                         sorted(reference_matchups, key=lambda m: m['flight1']))):
    expected_match = f"{expected['flight1']} vs {expected['flight2']}"
    actual_match = f"{actual['flight1']} vs {actual['flight2']}"
    
    if (actual['flight1'] == expected['flight1'] and actual['flight2'] == expected['flight2']) or \
       (actual['flight1'] == expected['flight2'] and actual['flight2'] == expected['flight1']):
        print(f"Match {i+1}: ✓ {actual_match} (matches reference)")
    else:
        print(f"Match {i+1}: ✗ {actual_match} (expected {expected_match})")

# Test with a different set of 5 flights
print("\n\nTEST WITH RANDOM 5 FLIGHTS (1 field)")
schedule, fields = generate_schedule(['A01', 'A02', 'A03', 'B16', 'B17'], '08:00', 1, flexible_scheduling=True)
print('FIELD 1 FLIGHTS:')
print(fields[0])
print('\nSCHEDULE:')
for match in schedule:
    print(f'Field {match["field"]}, Match {match["match_number"]}: {match["flight1"]} vs {match["flight2"]}')

# Count games per flight
flights = {}
for match in schedule:
    f1 = match["flight1"]
    f2 = match["flight2"]
    if f1 not in flights:
        flights[f1] = 0
    if f2 not in flights:
        flights[f2] = 0
    flights[f1] += 1
    flights[f2] += 1

print("\nGAMES PER FLIGHT:")
for flight, count in flights.items():
    print(f"{flight}: {count} games")

# Check for back-to-back games
back_to_back_issues = check_back_to_back(schedule)
if back_to_back_issues:
    print("\nBACK-TO-BACK GAMES DETECTED:")
    for issue in back_to_back_issues:
        print(f"- {issue}")
else:
    print("\nNo back-to-back games detected.")

# Check for same-squadron matches
def check_same_squadron_matches(schedule):
    """Check if any flights from the same squadron play against each other."""
    same_squadron_matches = []
    
    for match in schedule:
        flight1 = match["flight1"]
        flight2 = match["flight2"]
        
        # Check if they're from the same squadron (first character is the squadron)
        if flight1[0] == flight2[0]:
            same_squadron_matches.append(
                f"Field {match['field']}, Match {match['match_number']}: {flight1} vs {flight2} (both from squadron {flight1[0]})"
            )
    
    return same_squadron_matches

# After your existing test code, add:
print("\n\nTEST FOR SQUADRON SELF-PLAY PREVENTION")
# Test with a mix of squadrons that might trigger same-squadron matchups
schedule, fields = generate_schedule(['A01', 'A02', 'A03', 'A04', 'B01'], '08:00', 1, flexible_scheduling=True)
print('FIELD 1 FLIGHTS:')
print(fields[0])
print('\nSCHEDULE:')
for match in schedule:
    print(f'Field {match["field"]}, Match {match["match_number"]}: {match["flight1"]} vs {match["flight2"]}')

# Check for same-squadron matches
same_squadron_issues = check_same_squadron_matches(schedule)
if same_squadron_issues:
    print("\nSAME SQUADRON MATCHES DETECTED:")
    for issue in same_squadron_issues:
        print(f"- {issue}")
else:
    print("\nNo same-squadron matches detected - success!")

# Count games per flight
flights = {}
for match in schedule:
    f1 = match["flight1"]
    f2 = match["flight2"]
    if f1 not in flights:
        flights[f1] = 0
    if f2 not in flights:
        flights[f2] = 0
    flights[f1] += 1
    flights[f2] += 1

print("\nGAMES PER FLIGHT:")
for flight, count in flights.items():
    print(f"{flight}: {count} games") 