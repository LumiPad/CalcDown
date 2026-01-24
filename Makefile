# ==============================================================================
# Makefile — CalcDown (modular, POD-style)
# ==============================================================================

# Shared variables and configuration
include make/vars.mk

# Node/TypeScript workflow
include make/node.mk

# Cleaning and housekeeping
include make/clean.mk

# Help aggregator
include make/help.mk

.DEFAULT_GOAL := help

