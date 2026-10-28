import os

# Tests sign their own sessions; the key must exist before ``main`` is imported
# because the settings object is cached on first use.
os.environ.setdefault("AUTH_SECRET_KEY", "test-auth-secret-not-for-production")
