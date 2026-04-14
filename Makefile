.PHONY: db run

db:
	docker compose up -d db

run:
	npm run migrate && npx tsx src/cli/index.ts
