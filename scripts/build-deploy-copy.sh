#!/usr/bin/env bash
# Builds the folder that gets deployed, from a CLEAN copy of the commit
# (git archive), never from the working folder. Used by
# .github/workflows/site-deploy.yml for previews and production.
#
#   scripts/build-deploy-copy.sh <out-dir>
#
# 1. git archive HEAD into <out-dir>, so only committed files go out.
# 2. Run build-shop-routes, build-og and build-headers inside that copy.
#    build-og needs playwright-core (PLAYWRIGHT_CORE) and Chrome (CHROME).
# 3. Remove what must never be public: reference/, scripts/, README.md,
#    .git, .github and .wrangler.
set -euo pipefail

out="${1:?usage: build-deploy-copy.sh <out-dir>}"
rm -rf "$out"
mkdir -p "$out"
git archive --format=tar HEAD | tar -x -C "$out"

node "$out/scripts/build-shop-routes.mjs"
node "$out/scripts/build-og.mjs"
node "$out/scripts/build-headers.mjs"

rm -rf "$out/reference" "$out/scripts" "$out/README.md" "$out/.git" "$out/.github" "$out/.wrangler"

for p in reference scripts README.md .git .github .wrangler; do
  if [ -e "$out/$p" ]; then echo "still in the deploy copy: $p" >&2; exit 1; fi
done
grep -q "Content-Security-Policy" "$out/_headers" || { echo "_headers has no CSP" >&2; exit 1; }
echo "Deploy copy ready: $(find "$out" -type f | wc -l) files in $out"
