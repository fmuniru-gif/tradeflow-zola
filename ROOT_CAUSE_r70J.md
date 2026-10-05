# r70J Root Cause Report

The r70I generated `CLOUD_B64` contained two capability guards in execution
order. The r70 MB3 transition layer first assigned the global historical name
to `r70CapabilityGuard`, which correctly reads
`zezms_mb3_get_protocol_transition` and validates the active M4/3 or M4/4
contract. Later, the retained r67J fragment assigned that same global name to
an old M4/3-only function. JavaScript therefore selected the later r67J
assignment.

This caused an MB3-capable server to display `M4/3 Active · M4/4 Ready` while
Live Sync still called `zezms_m43_get_capabilities` and compared against old
M4/3 values. It is a generated-runtime composition/precedence defect, not a
checkpoint, lifecycle, cursor, or business-data inconsistency.

r70J keeps r67J's ordered reconciliation, preflight, error handling and true
legacy-server validator. It renames that validator to
`r67jLegacyCapabilityGuard` and makes the **final** global assignment
`r70jAuthoritativeCapabilityGuard`. On an MB3 server it calls only r70's
dynamic guard. Only when r70 explicitly reports the transition RPC missing
does it invoke the named legacy fallback.
