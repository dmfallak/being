.PHONY: db run

db:
	docker compose up -d db

run:
	ALCHEMIST_ROOT=$(CURDIR)/../alchemist npm run migrate && ALCHEMIST_ROOT=$(CURDIR)/../alchemist npx tsx src/cli/index.ts
