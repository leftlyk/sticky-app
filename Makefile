.PHONY: release build install local check help

REPO := leftlyk/sticky-app

help:
	@echo "Targets:"
	@echo "  make release VERSION=x.y.z MSG=\"...\"   bump version, commit, tag, push (CI builds)"
	@echo "  make build                              local Tauri release build (.app only)"
	@echo "  make install                            build + install to /Applications"
	@echo "  make local VERSION=x.y.z                build + install at a specific version"
	@echo "  make check                              JS syntax + Rust cargo check"

# bump version in 3 files, commit, tag, push — triggers CI release workflow
release:
ifndef VERSION
	$(error usage: make release VERSION=x.y.z MSG="commit message")
endif
ifndef MSG
	$(error usage: make release VERSION=x.y.z MSG="commit message")
endif
	@echo "→ bumping to v$(VERSION)"
	@sed -i '' 's/"version": "[^"]*"/"version": "$(VERSION)"/' package.json src-tauri/tauri.conf.json
	@sed -i '' 's/^version = ".*"/version = "$(VERSION)"/' src-tauri/Cargo.toml
	@grep -E '"version"|^version' package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml | head -3
	@git add -A
	@git commit -m "release v$(VERSION): $(MSG)"
	@git tag v$(VERSION)
	@git push origin main
	@git push origin v$(VERSION)
	@echo ""
	@echo "✓ pushed v$(VERSION). watch: https://github.com/$(REPO)/actions"
	@echo "  publish draft when green: gh release edit v$(VERSION) --draft=false --repo $(REPO)"

# local production build (no signing required, createUpdaterArtifacts is false in config)
build:
	cargo tauri build --bundles app

# build then replace /Applications/sticky.app
install: build
	-osascript -e 'quit app "sticky"' 2>/dev/null
	@sleep 1
	rm -rf /Applications/sticky.app
	cp -R src-tauri/target/release/bundle/macos/sticky.app /Applications/
	open /Applications/sticky.app
	@echo "✓ installed at /Applications/sticky.app"

# build + install at a specific version (useful for testing the updater locally)
local:
ifndef VERSION
	$(error usage: make local VERSION=x.y.z)
endif
	@CURRENT=$$(grep '^version' src-tauri/Cargo.toml | head -1 | cut -d'"' -f2); \
	echo "→ temporary downgrade $$CURRENT -> $(VERSION) for build"; \
	sed -i '' 's/"version": "[^"]*"/"version": "$(VERSION)"/' package.json src-tauri/tauri.conf.json; \
	sed -i '' 's/^version = ".*"/version = "$(VERSION)"/' src-tauri/Cargo.toml; \
	$(MAKE) install; \
	echo "→ restoring $$CURRENT"; \
	sed -i '' 's/"version": "$(VERSION)"/"version": "'$$CURRENT'"/' package.json src-tauri/tauri.conf.json; \
	sed -i '' 's/^version = "$(VERSION)"/version = "'$$CURRENT'"/' src-tauri/Cargo.toml

# quick sanity: JS syntax + Rust check
check:
	@for f in public/*.js; do node --check $$f && echo "  ok $$f"; done
	cd src-tauri && cargo check
