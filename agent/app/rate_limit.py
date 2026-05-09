from slowapi import Limiter
from slowapi.util import get_remote_address

# Single Limiter instance shared by the app + every route decorator.
limiter = Limiter(key_func=get_remote_address)
