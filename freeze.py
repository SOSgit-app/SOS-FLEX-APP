from flask_frozen import Freezer
from app import app
from flask import session
import os

freezer = Freezer(app)

# Set up mock data for static site generation
app.config['FREEZER_RELATIVE_URLS'] = True
app.config['FREEZING'] = True
app.config['FREEZER_IGNORE_404_NOT_FOUND'] = True
app.config['FREEZER_DESTINATION'] = 'public'
app.config['FREEZER_DEFAULT_MIMETYPE'] = 'text/html'
app.config['FREEZER_REMOVE_EXTRA_FILES'] = False
app.config['FREEZER_SKIP_EXISTING'] = True

# Disable URL crawling
app.config['FREEZER_FOLLOW_LINKS'] = False

# Mock session data for static pages
MOCK_SESSION_DATA = {
    'class_name': 'Sample Class',
    'start_time': '08:00',
    'num_fields': 8,
    'referees': {},
    'schedule': [],
    'flex_b_schedule': []
}

# Define URL generators for all static routes
@freezer.register_generator
def index():
    yield '/'

@freezer.register_generator
def flight_selection():
    yield '/flight_selection'

@freezer.register_generator
def view_flex_a():
    yield '/view_flex_a'

@freezer.register_generator
def schedule_flex_b():
    yield '/schedule_flex_b'

if __name__ == '__main__':
    # Set up mock session data
    with app.test_request_context():
        for key, value in MOCK_SESSION_DATA.items():
            session[key] = value
        
        # Create the public directory if it doesn't exist
        public_dir = os.path.join(os.path.dirname(__file__), 'public')
        os.makedirs(public_dir, exist_ok=True)
        
        # Freeze the app
        freezer.freeze()