import os
import sys

from jinja2 import FileSystemLoader


def _resource_dir() -> str:
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def main() -> None:
    # Import the existing Flask app (defined in repo root app.py)
    import app as app_module  # type: ignore

    base = _resource_dir()
    templates = os.path.join(base, "templates")

    # Ensure Flask can find templates when frozen by PyInstaller.
    app_module.app.template_folder = templates
    app_module.app.jinja_loader = FileSystemLoader(templates)

    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app_module.app.run(host="127.0.0.1", port=port, debug=debug)


if __name__ == "__main__":
    main()

