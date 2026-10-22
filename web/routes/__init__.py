from web.routes.pages import pages
from web.routes.video import video


def register_routes(app):
    app.register_blueprint(pages)
    app.register_blueprint(video)
