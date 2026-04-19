.PHONY: db run lab

ALCHEMIST_ROOT := $(CURDIR)/../alchemist

db:
	docker compose up -d --wait db

lab:
	$(MAKE) -C $(ALCHEMIST_ROOT) build

run: db lab
	ALCHEMIST_ROOT=$(ALCHEMIST_ROOT) npm run migrate && ALCHEMIST_ROOT=$(ALCHEMIST_ROOT) npx tsx src/cli/index.ts
