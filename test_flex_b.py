from app import generate_schedule

def test_flex_b_schedule():
    """Test the Flex B schedule generation with our fixed logic."""
    
    # First, create a Flex A schedule
    selected_classes = ['A01', 'A02', 'A03', 'B01', 'B02', 'B03', 'C01', 'C02']
    start_time = '08:00'
    num_fields = 2
    
    print("TESTING FLEX A & B SCHEDULING")
    print("============================")
    
    # Generate Flex A schedule
    schedule_a, fields_a = generate_schedule(
        selected_classes, 
        start_time, 
        num_fields, 
        flexible_scheduling=True
    )
    
    print("FLEX A FIELDS:")
    for i, field in enumerate(fields_a):
        print(f"Field {i+1}: {field}")
    
    print("\nFLEX A SCHEDULE:")
    for match in schedule_a:
        print(f"Field {match['field']}, Match {match['match_number']}: {match['flight1']} vs {match['flight2']}")
        
    # Create a mapping of which field each flight was in for Flex A
    flex_a_fields = {}
    for match in schedule_a:
        flex_a_fields[match['flight1']] = match['field']
        flex_a_fields[match['flight2']] = match['field']
    
    # Create new field assignments for Flex B
    fields_b = [[] for _ in range(num_fields)]
    
    # More realistic Flex B field assignment - avoid Flex A fields
    for flight in selected_classes:
        avoid_field = flex_a_fields.get(flight, 0) - 1  # Convert to 0-based index
        possible_fields = [i for i in range(num_fields) if i != avoid_field]
        
        # Place in a different field than Flex A
        field_idx = possible_fields[0] if possible_fields else 0
        fields_b[field_idx].append(flight)
    
    # Generate Flex B schedule using custom fields
    schedule_b, _ = generate_schedule(
        selected_classes, 
        start_time, 
        num_fields, 
        flexible_scheduling=True,
        custom_fields=fields_b
    )
    
    print("\nFLEX B FIELDS:")
    for i, field in enumerate(fields_b):
        print(f"Field {i+1}: {field}")
    
    print("\nFLEX B SCHEDULE:")
    for match in schedule_b:
        print(f"Field {match['field']}, Match {match['match_number']}: {match['flight1']} vs {match['flight2']}")
        
    # Check that Flex B generated valid matchups
    print("\nFLEX B VALIDITY CHECK:")
    
    # Each flight should play at least once
    flight_games = {flight: 0 for flight in selected_classes}
    for match in schedule_b:
        flight_games[match['flight1']] += 1
        flight_games[match['flight2']] += 1
    
    all_flights_have_games = all(games > 0 for games in flight_games.values())
    print(f"All flights have games: {all_flights_have_games}")
    print("Games per flight:")
    for flight, games in flight_games.items():
        print(f"  {flight}: {games}")
    
    # Check if there are any matchups
    has_matchups = len(schedule_b) > 0
    print(f"Has matchups: {has_matchups}")
    print(f"Total matchups: {len(schedule_b)}")
    
    return all_flights_have_games and has_matchups

if __name__ == "__main__":
    test_result = test_flex_b_schedule()
    print(f"\nTest {'PASSED' if test_result else 'FAILED'}") 