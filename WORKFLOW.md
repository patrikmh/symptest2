 ---
  interval_ms: 30000                    # Poll every 30 seconds
  workspace_root: .pi/symphony-workspaces  # Per-issue workspaces live here
  max_concurrent_agents: 4              # Max 4 agents running at once
  retry_max: 3                          # Max 3 retries per issue
  retry_delay_ms: 5000                  # 5s between retries
  max_backoff_ms: 300000                # Cap backoff at 5 minutes
  stall_timeout_ms: 300000              # Kill stalled agents after 5 min
  ---