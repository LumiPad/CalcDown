# ==============================================================================
# make/clean.mk — Cleaning and housekeeping
# ==============================================================================

.PHONY: clean clean-dist clean-node_modules clean-all

clean: clean-dist ## Remove build artifacts

clean-dist: ## Remove dist output
	rm -rf $(DIST_DIR)

clean-node_modules: ## Remove node_modules (forces reinstall)
	rm -rf node_modules

clean-all: clean-dist clean-node_modules ## Remove dist and node_modules

