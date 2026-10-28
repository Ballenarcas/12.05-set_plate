import os

# Tests sign their own sessions; the key must exist before ``main`` is imported
# because the settings object is cached on first use.
#
# It is assigned, not defaulted: CI exports ``AUTH_SECRET_KEY=""``, and an empty
# value still counts as set for ``setdefault``. The suite then ran without a
# signing key, every authenticated request answered 500 and 25 tests failed.
os.environ["AUTH_SECRET_KEY"] = "test-auth-secret-not-for-production"
