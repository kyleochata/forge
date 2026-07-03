.PHONY: eval eval-smoke baseline selftest

# Full suite: every task x 2 arms x 3 reps, then report. Resumable — rerun to continue.
eval:
	node eval/runEval.js
	node eval/score.js

# Quick subset for iterating on the harness: 6 tasks x 1 rep.
eval-smoke:
	node eval/runEval.js --tasks bugfix-off-by-one,feature-cli-json,feature-lru,refactor-extract-validate,multifile-split-utils,underspec-email --reps 1 --results eval/results/smoke
	node eval/score.js --results eval/results/smoke --out eval/report-smoke

# Snapshot the current report as the regression baseline.
baseline:
	cp eval/report.json eval/baseline.json

# Offline plumbing check (mocked models, no spend).
selftest:
	node eval/selftest.js
