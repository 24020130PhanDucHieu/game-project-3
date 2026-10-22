# Caddy Configuration for Dual-Gateway High Availability (Active-Active with Health Checks)
# Replace IPs with your EC2 Gateway Private/Public IPs.

arena.high-availability.example.com {
    encode gzip

    # Reverse proxy with automatic round-robin and active health check failover
    reverse_proxy 10.0.1.10:8080 10.0.2.20:8080 {
        lb_policy round_robin
        lb_try_duration 2s

        # Active health check
        health_uri /ready
        health_interval 10s
        health_timeout 3s
        health_status 200

        # Mark dead immediately on connection failure and retry other upstream
        fail_duration 15s
        max_fails 2
    }
}
