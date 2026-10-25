
# Worker configuration
workers = 1
worker_class = "gthread"
threads = 5

# Timeouts
timeout = 120
graceful_timeout = 15
keepalive = 2

# Memory and restarts
preload_app = False
max_requests = 0
max_requests_jitter = 0

# Request limits
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# Logging
capture_output = True
accesslog = "-"
errorlog = "-"
loglevel = "info"
