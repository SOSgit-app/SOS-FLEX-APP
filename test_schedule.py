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

# Test with 4 flights (even number)
print("TEST WITH 4 FLIGHTS (1 field)")
schedule, fields = generate_schedule(['A01', 'A02', 'B16', 'B17'], '08:00', 1, flexible_scheduling=True)
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

# Test with 5 flights (odd number)
print("\n\nTEST WITH 5 FLIGHTS (1 field)")
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

# Test with multiple fields
print("\n\nTEST WITH MULTIPLE FIELDS")
selected_classes = ['A01', 'A02', 'A03', 'A04', 'A05', 'B16', 'B17', 'B18', 'B19']
schedule, fields = generate_schedule(selected_classes, '08:00', 2, flexible_scheduling=True)

for i, field in enumerate(fields):
    print(f'\nFIELD {i+1} FLIGHTS:')
    print(field)

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