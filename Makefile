.PHONY: all build test bump bump-minor bump-major

all: build

build:
	npm run build

test:
	npm test

# 🚀 Use 'make bump' to release.
bump:
	$(call bump_version,patch)

bump-minor:
	$(call bump_version,minor)

bump-major:
	$(call bump_version,major)

define bump_version
	@echo "Creating release branch and bumping version..."
	@BRANCH_NAME=release-bump-$$(date +%Y%m%d-%H%M%S); \
	git checkout -b $$BRANCH_NAME; \
	npm version $(1); \
	git push origin HEAD --follow-tags; \
	NEW_VERSION=$$(node -p "require('./package.json').version"); \
	gh pr create --fill --base main --title "chore: release v$$NEW_VERSION"
endef
